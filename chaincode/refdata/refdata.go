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

// EntryStatus is a closed enum -- docs/06_erd.md REFERENCE_ENTRY.status.
type EntryStatus string

const (
	StatusActive     EntryStatus = "active"
	StatusDeprecated EntryStatus = "deprecated"
)

// ReferenceEntry mirrors docs/06_erd.md's REFERENCE_ENTRY, with one
// addition: DeprecatedBy/DeprecatedAt. The ERD lists only a single
// added_by/timestamp pair, but FRD-CHAIN-REFDATA-003 requires deprecation
// to *also* be recorded with its own acting identity and timestamp --
// there's no field in the ERD for that. Added here to satisfy the FRD
// (the more specific, P0-priority requirement); flagging the ERD gap is a
// documentation follow-up, not something to silently drop.
//
// SupersededBy also has no defined chaincode write path yet (see
// DeprecateReferenceEntry) -- it stays empty until that gap is resolved.
type ReferenceEntry struct {
	EntryID      string      `json:"entry_id"`
	Type         EntryType   `json:"type"`
	Value        string      `json:"value"`
	Version      string      `json:"version"`
	Status       EntryStatus `json:"status"`
	SupersededBy string      `json:"superseded_by,omitempty"`
	Metadata     string      `json:"metadata,omitempty"` // opaque, type-specific JSON
	Timestamp    string      `json:"timestamp"`
	AddedBy      string      `json:"added_by"`
	DeprecatedBy string      `json:"deprecated_by,omitempty"`
	DeprecatedAt string      `json:"deprecated_at,omitempty"`
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

func currentTxTimestamp(ctx contractapi.TransactionContextInterface) (string, error) {
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("failed to read transaction timestamp: %w", err)
	}
	return time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC().Format(time.RFC3339), nil
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

	timestamp, err := currentTxTimestamp(ctx)
	if err != nil {
		return nil, err
	}

	entry := ReferenceEntry{
		EntryID:   key,
		Type:      et,
		Value:     value,
		Version:   "1",
		Status:    StatusActive,
		Metadata:  metadata,
		Timestamp: timestamp,
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

// DeprecateReferenceEntry marks an existing entry deprecated
// (FRD-CHAIN-REFDATA-002). System Admin only. Rejects deprecating a value
// that was never added, and rejects deprecating something already
// deprecated -- deprecation is a one-way, one-time transition.
//
// This is the one deliberate exception to "every PutState call in this
// module writes to a brand-new key": it re-writes the entry's own key, but
// only ever to flip Status (and set DeprecatedBy/DeprecatedAt) -- Type,
// Value, Version, Metadata, Timestamp, and AddedBy are read back unchanged
// from the existing entry and never altered. That's a narrowly-scoped,
// single-purpose state transition, not the generic UpdateReferenceEntry
// function Guardrails §3a Rule 1 forbids (no function here accepts a new
// Value/Type/Metadata for an existing entry_id). Matches
// docs/05_architecture.md §6's own description of this flow: "mark X
// deprecated (not deleted)."
//
// NOTE: neither FRD-CHAIN-REFDATA-002 nor the API reference
// (17_api_reference.md, POST /reference-data/:type/:entryId/deprecate)
// defines a parameter for naming a replacement entry at deprecation time --
// the Screen Requirements' Deprecate modal is explicitly fieldless ("no
// reason field, unlike Fail verdicts"). So SupersededBy has no defined
// write path yet. This function does not invent one; it implements exactly
// what's specified. Populating SupersededBy is an open gap to raise as a
// follow-up requirement, not something to guess at here.
func (c *RefdataContract) DeprecateReferenceEntry(
	ctx contractapi.TransactionContextInterface,
	entryType string,
	value string,
) (*ReferenceEntry, error) {
	if err := requireSystemAdmin(ctx); err != nil {
		return nil, err
	}

	et := EntryType(entryType)
	if !et.valid() {
		return nil, fmt.Errorf("invalid_entry_type: %q is not one of ingredient, supplier, standard, fail_reason", entryType)
	}

	key, err := referenceEntryKey(ctx, et, value)
	if err != nil {
		return nil, fmt.Errorf("failed to build composite key: %w", err)
	}

	existingBytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if existingBytes == nil {
		return nil, fmt.Errorf("not_a_recognized_value: no %s entry with value %q exists", entryType, value)
	}

	var entry ReferenceEntry
	if err := json.Unmarshal(existingBytes, &entry); err != nil {
		return nil, fmt.Errorf("failed to unmarshal reference entry: %w", err)
	}

	if entry.Status == StatusDeprecated {
		return nil, fmt.Errorf("already_deprecated: %s entry %q is already deprecated", entryType, value)
	}

	deprecatedBy, err := cid.GetID(ctx.GetStub())
	if err != nil {
		return nil, fmt.Errorf("failed to resolve caller identity: %w", err)
	}
	timestamp, err := currentTxTimestamp(ctx)
	if err != nil {
		return nil, err
	}

	// Only these two fields change. Everything else on entry is exactly
	// what was read back above.
	entry.Status = StatusDeprecated
	entry.DeprecatedBy = deprecatedBy
	entry.DeprecatedAt = timestamp

	entryJSON, err := json.Marshal(entry)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal reference entry: %w", err)
	}

	if err := ctx.GetStub().PutState(key, entryJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	return &entry, nil
}

// ResolveActiveReference resolves a controlled value against the active
// reference list. `batch` invokes this in the same Fabric transaction used
// to submit an ingredient/supplier/standard reference (TRD §23.1) -- the
// entry key read here enters that transaction's read set, which is exactly
// what makes a concurrent deprecation produce either a consistent
// pre-deprecation snapshot or an MVCC conflict, never a mixed state
// (FRD-CHAIN-CONCURRENCY-001, TRD §23.6).
//
// No role restriction: this is a read, not a mutation, and any operational
// role may need to validate its own submission against the current
// reference list. Guardrails' "no rule enforced only outside chaincode"
// principle governs writes; nothing in FRD/TRD restricts who may read.
//
// A deprecated entry resolves as not_a_recognized_value, identical to an
// entry that was never added -- from a new submission's point of view,
// "deprecated" and "never existed" carry the same consequence.
func (c *RefdataContract) ResolveActiveReference(
	ctx contractapi.TransactionContextInterface,
	entryType string,
	value string,
) (*ReferenceEntry, error) {
	et := EntryType(entryType)
	if !et.valid() {
		return nil, fmt.Errorf("invalid_entry_type: %q is not one of ingredient, supplier, standard, fail_reason", entryType)
	}

	key, err := referenceEntryKey(ctx, et, value)
	if err != nil {
		return nil, fmt.Errorf("failed to build composite key: %w", err)
	}

	entryBytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if entryBytes == nil {
		return nil, fmt.Errorf("not_a_recognized_value: no %s entry with value %q exists", entryType, value)
	}

	var entry ReferenceEntry
	if err := json.Unmarshal(entryBytes, &entry); err != nil {
		return nil, fmt.Errorf("failed to unmarshal reference entry: %w", err)
	}

	if entry.Status != StatusActive {
		return nil, fmt.Errorf("not_a_recognized_value: %s entry %q is deprecated", entryType, value)
	}

	return &entry, nil
}

// ReferenceEntryHistoryItem is one point in a reference entry's full
// history -- one per ledger write to that entry's key, oldest first.
type ReferenceEntryHistoryItem struct {
	TxID      string          `json:"tx_id"`
	Timestamp string          `json:"timestamp"`
	IsDelete  bool            `json:"is_delete"`
	Entry     *ReferenceEntry `json:"entry,omitempty"`
}

// GetReferenceEntryHistory returns every recorded version of a reference
// entry, in write order (FRD-CHAIN-REFDATA-004: "deprecated reference-data
// entries must remain visible in reference-data history, not hidden").
//
// DeprecateReferenceEntry writes to the same key AddReferenceEntry created
// (see its comment for why that's a narrowly-scoped exception, not a
// generic update). That means a plain GetState/ResolveActiveReference call
// only ever sees the latest version -- this function is what makes the
// pre-deprecation state actually retrievable, not just theoretically
// recoverable. Fabric's GetHistoryForKey walks the ledger's own append-only
// write history for this key; IsDelete is always false here since no
// delete ever happens, included for completeness against the iterator's
// real shape.
//
// No role restriction, matching ResolveActiveReference: this is a read.
func (c *RefdataContract) GetReferenceEntryHistory(
	ctx contractapi.TransactionContextInterface,
	entryType string,
	value string,
) ([]ReferenceEntryHistoryItem, error) {
	et := EntryType(entryType)
	if !et.valid() {
		return nil, fmt.Errorf("invalid_entry_type: %q is not one of ingredient, supplier, standard, fail_reason", entryType)
	}

	key, err := referenceEntryKey(ctx, et, value)
	if err != nil {
		return nil, fmt.Errorf("failed to build composite key: %w", err)
	}

	iterator, err := ctx.GetStub().GetHistoryForKey(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read history for key: %w", err)
	}
	defer iterator.Close()

	history := []ReferenceEntryHistoryItem{}
	for iterator.HasNext() {
		mod, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to read next history entry: %w", err)
		}

		item := ReferenceEntryHistoryItem{
			TxID:      mod.GetTxId(),
			Timestamp: mod.GetTimestamp().AsTime().UTC().Format(time.RFC3339),
			IsDelete:  mod.GetIsDelete(),
		}

		if !mod.GetIsDelete() {
			var entry ReferenceEntry
			if err := json.Unmarshal(mod.GetValue(), &entry); err != nil {
				return nil, fmt.Errorf("failed to unmarshal historical entry: %w", err)
			}
			item.Entry = &entry
		}

		history = append(history, item)
	}

	if len(history) == 0 {
		return nil, fmt.Errorf("not_a_recognized_value: no %s entry with value %q exists", entryType, value)
	}

	return history, nil
}

// ListReferenceEntries returns every entry of a given type -- active and
// deprecated together, deprecated ones always included, never filtered
// out. This is what actually powers the Reference Data List screen
// (docs/12_seed_data_specification.md §12), as distinct from
// GetReferenceEntryHistory (one entry's full version history):
// FRD-CHAIN-REFDATA-004 needs both -- this for browsing every entry of a
// type, that for audit-grade proof that nothing was silently altered.
//
// No role restriction, matching the other read functions in this module.
func (c *RefdataContract) ListReferenceEntries(
	ctx contractapi.TransactionContextInterface,
	entryType string,
) ([]*ReferenceEntry, error) {
	et := EntryType(entryType)
	if !et.valid() {
		return nil, fmt.Errorf("invalid_entry_type: %q is not one of ingredient, supplier, standard, fail_reason", entryType)
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("referenceEntry", []string{string(et)})
	if err != nil {
		return nil, fmt.Errorf("failed to query reference entries: %w", err)
	}
	defer iterator.Close()

	entries := []*ReferenceEntry{}
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to read next reference entry: %w", err)
		}

		var entry ReferenceEntry
		if err := json.Unmarshal(kv.GetValue(), &entry); err != nil {
			return nil, fmt.Errorf("failed to unmarshal reference entry: %w", err)
		}
		entries = append(entries, &entry)
	}

	return entries, nil
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
