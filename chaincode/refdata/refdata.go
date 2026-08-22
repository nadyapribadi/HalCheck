// Package main implements the refdata chaincode module: governed,
// supersede-only reference data (ingredients, suppliers, standards, fail
// reasons). See docs/04_trd.md §10, docs/06_erd.md REFERENCE_ENTRY, and
// docs/18_vibe_coding_guardrails.md §3a for the rules this module must hold to.
//
// Write access is System-Admin-only, enforced here independently of any
// caller assumption (Guardrails §3a Rule 2) -- never via a client-supplied
// role string (Guardrails §3 Rule 1).
package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// EntryType is a closed enum -- docs/06_erd.md REFERENCE_ENTRY.type.
type EntryType string

const (
	EntryTypeIngredient EntryType = "ingredient"
	EntryTypeSupplier   EntryType = "supplier"
	EntryTypeStandard   EntryType = "standard"
	EntryTypeFailReason EntryType = "fail_reason"
)

func (t EntryType) valid() bool {
	switch t {
	case EntryTypeIngredient, EntryTypeSupplier, EntryTypeStandard, EntryTypeFailReason:
		return true
	default:
		return false
	}
}

// ReferenceEntry mirrors docs/06_erd.md's REFERENCE_ENTRY exactly.
type ReferenceEntry struct {
	EntryID   string    `json:"entry_id"`
	Type      EntryType `json:"type"`
	Value     string    `json:"value"`
	Version   string    `json:"version"`
	Metadata  string    `json:"metadata,omitempty"` // opaque, type-specific JSON
	Timestamp string    `json:"timestamp"`
	AddedBy   string    `json:"added_by"`
}

// RefdataContract implements the reference-data chaincode functions.
type RefdataContract struct {
	contractapi.Contract
}

// requireSystemAdmin rejects the call unless the invoking identity's
// certificate carries role=system_admin. This is the independent check
// Guardrails §3a Rule 2 requires -- it never trusts that reaching this
// function at all implies authorization.
func requireSystemAdmin(ctx contractapi.TransactionContextInterface) error {
	err := cid.AssertAttributeValue(ctx.GetStub(), "role", "system_admin")
	if err != nil {
		return fmt.Errorf("role_scope_violation: caller is not System Admin: %w", err)
	}
	return nil
}

// referenceEntryKey is the composite key an entry is stored under. Using
// type+value (not a random ID) makes AddReferenceEntry's duplicate check a
// direct GetState lookup rather than a range query.
func referenceEntryKey(ctx contractapi.TransactionContextInterface, entryType EntryType, value string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("referenceEntry", []string{string(entryType), value})
}

// AddReferenceEntry adds a new reference-data entry (FRD-CHAIN-REFDATA-001).
// System Admin only. Rejects an exact-duplicate (type, value) pair -- the
// same duplicate-prevention rule stated for the UI (Screen Requirements
// §12.1) is enforced here first, per this project's one rule that matters
// most: no rule is ever enforced only outside chaincode.
func (c *RefdataContract) AddReferenceEntry(
	ctx contractapi.TransactionContextInterface,
	entryType string,
	value string,
	metadata string,
) (*ReferenceEntry, error) {
	if err := requireSystemAdmin(ctx); err != nil {
		return nil, err
	}

	et := EntryType(entryType)
	if !et.valid() {
		return nil, fmt.Errorf("invalid_entry_type: %q is not one of ingredient, supplier, standard, fail_reason", entryType)
	}
	if value == "" {
		return nil, fmt.Errorf("missing_field: value is required")
	}

	key, err := referenceEntryKey(ctx, et, value)
	if err != nil {
		return nil, fmt.Errorf("failed to build composite key: %w", err)
	}

	existing, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if existing != nil {
		return nil, fmt.Errorf("duplicate_entry: a %s entry with value %q already exists", entryType, value)
	}

	addedBy, err := cid.GetID(ctx.GetStub())
	if err != nil {
		return nil, fmt.Errorf("failed to resolve caller identity: %w", err)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to read transaction timestamp: %w", err)
	}

	entry := ReferenceEntry{
		EntryID:   key,
		Type:      et,
		Value:     value,
		Version:   "1",
		Metadata:  metadata,
		Timestamp: time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC().Format(time.RFC3339),
		AddedBy:   addedBy,
	}

	entryJSON, err := json.Marshal(entry)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal reference entry: %w", err)
	}

	if err := ctx.GetStub().PutState(key, entryJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	return &entry, nil
}

// DeprecationRecord marks a reference entry as deprecated without ever
// touching the original entry's own ledger key. Deprecation status is
// derived at read time (ResolveActiveReference, next) from whether this
// record exists -- the same "supersede without touching the original"
// discipline already used for INGREDIENT_RECORD/PRODUCTION_RECORD
// (docs/06_erd.md §4). Every PutState call anywhere in this module writes
// to a key that has never been written before, which is what makes "no
// update function exists" structurally true here, not just a convention
// (Guardrails §3a Rule 1) -- deprecating an entry is a new fact recorded
// about it, not an edit to it.
type DeprecationRecord struct {
	EntryID      string `json:"entry_id"`
	DeprecatedBy string `json:"deprecated_by"`
	Timestamp    string `json:"timestamp"`
}

// deprecationKey deliberately takes the same (type, value) pair
// referenceEntryKey does, rather than that already-built composite key
// string -- a composite key's encoding embeds the U+0000 delimiter byte,
// which Fabric rejects if passed back in as an attribute of another
// composite key.
func deprecationKey(ctx contractapi.TransactionContextInterface, entryType EntryType, value string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("deprecation", []string{string(entryType), value})
}

// DeprecateReferenceEntry marks an existing entry deprecated
// (FRD-CHAIN-REFDATA-002). System Admin only. Rejects deprecating a value
// that was never added, and rejects deprecating something already
// deprecated -- deprecation is a one-way, one-time transition.
//
// NOTE: neither FRD-CHAIN-REFDATA-002 nor the API reference
// (17_api_reference.md, POST /reference-data/:type/:entryId/deprecate)
// defines a parameter for naming a replacement entry at deprecation time --
// the Screen Requirements' Deprecate modal is explicitly fieldless ("no
// reason field, unlike Fail verdicts"). So REFERENCE_ENTRY.superseded_by
// (06_erd.md) has no defined chaincode write path yet. This function does
// not invent one; it implements exactly what's specified. Populating
// superseded_by is an open gap to raise as a follow-up requirement, not
// something to guess at here.
func (c *RefdataContract) DeprecateReferenceEntry(
	ctx contractapi.TransactionContextInterface,
	entryType string,
	value string,
) (*DeprecationRecord, error) {
	if err := requireSystemAdmin(ctx); err != nil {
		return nil, err
	}

	et := EntryType(entryType)
	if !et.valid() {
		return nil, fmt.Errorf("invalid_entry_type: %q is not one of ingredient, supplier, standard, fail_reason", entryType)
	}

	entryKey, err := referenceEntryKey(ctx, et, value)
	if err != nil {
		return nil, fmt.Errorf("failed to build composite key: %w", err)
	}

	existing, err := ctx.GetStub().GetState(entryKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if existing == nil {
		return nil, fmt.Errorf("not_a_recognized_value: no %s entry with value %q exists", entryType, value)
	}

	depKey, err := deprecationKey(ctx, et, value)
	if err != nil {
		return nil, fmt.Errorf("failed to build deprecation key: %w", err)
	}

	alreadyDeprecated, err := ctx.GetStub().GetState(depKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if alreadyDeprecated != nil {
		return nil, fmt.Errorf("already_deprecated: %s entry %q is already deprecated", entryType, value)
	}

	deprecatedBy, err := cid.GetID(ctx.GetStub())
	if err != nil {
		return nil, fmt.Errorf("failed to resolve caller identity: %w", err)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to read transaction timestamp: %w", err)
	}

	record := DeprecationRecord{
		EntryID:      entryKey,
		DeprecatedBy: deprecatedBy,
		Timestamp:    time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC().Format(time.RFC3339),
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal deprecation record: %w", err)
	}

	if err := ctx.GetStub().PutState(depKey, recordJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	return &record, nil
}

func main() {
	chaincode, err := contractapi.NewChaincode(&RefdataContract{})
	if err != nil {
		panic(fmt.Sprintf("Error creating refdata chaincode: %v", err))
	}
	if err := chaincode.Start(); err != nil {
		panic(fmt.Sprintf("Error starting refdata chaincode: %v", err))
	}
}
