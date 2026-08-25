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
	"sort"
	"strconv"
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
// Versioning (TRD line 156: "supersede-only, matching the batch-correction
// pattern"): the ledger key for an entry is (type, value, version), not
// just (type, value) -- see referenceEntryKey. At most one version of a
// given (type, value) is ever Active at a time; adding a new version
// requires the previous one to already be Deprecated, and that add is what
// backfills SupersededBy on the entry it replaces (see AddReferenceEntry).
// The Deprecate action itself never sets SupersededBy -- Screen
// Requirements §12.1's Deprecate modal is deliberately fieldless, so there
// is no "replacement" to name at deprecation time; the link can only be
// made later, when a new version actually exists to point at.
// Note on the metadata struct tags below: contractapi generates its own
// JSON schema from these tags for response validation, and it is NOT
// driven by the json tag's `omitempty` -- a field is schema-required
// unless it carries its own `metadata:"...,optional"` tag. Missing this
// was a real bug caught only by a real network invocation (unit tests call
// these functions directly, bypassing contractapi's schema-validation
// layer entirely) -- see AGENTS.md/docs/14 P2 notes for the incident.
type ReferenceEntry struct {
	EntryID      string      `json:"entry_id" metadata:"entry_id"`
	Type         EntryType   `json:"type" metadata:"type"`
	Value        string      `json:"value" metadata:"value"`
	Version      string      `json:"version" metadata:"version"`
	Status       EntryStatus `json:"status" metadata:"status"`
	SupersededBy string      `json:"superseded_by,omitempty" metadata:"superseded_by,optional"`
	Metadata     string      `json:"metadata,omitempty" metadata:"metadata,optional"` // opaque, type-specific JSON
	Timestamp    string      `json:"timestamp" metadata:"timestamp"`
	AddedBy      string      `json:"added_by" metadata:"added_by"`
	DeprecatedBy string      `json:"deprecated_by,omitempty" metadata:"deprecated_by,optional"`
	DeprecatedAt string      `json:"deprecated_at,omitempty" metadata:"deprecated_at,optional"`
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

// referenceEntryKey is the composite key one specific version of an entry
// is stored under. Keying by (type, value, version) rather than just
// (type, value) is what makes versioning possible at all -- each version
// gets its own ledger slot, so deprecating version 1 and adding version 2
// doesn't overwrite anything; they're genuinely distinct keys.
func referenceEntryKey(ctx contractapi.TransactionContextInterface, entryType EntryType, value string, version string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("referenceEntry", []string{string(entryType), value, version})
}

// versionedEntry pairs a ReferenceEntry with the exact ledger key it was
// read from. That key is NOT always referenceEntryKey(type, value,
// entry.Version): entries written before this versioning scheme existed
// live under the older (type, value) 2-component key (no version
// component), and re-deriving a key from an entry's own fields would
// silently compute a different, nonexistent key for those -- writing a
// "deprecated" copy there instead of updating the real entry, and leaving
// the original untouched and still active. Every write-back in this file
// must reuse versionedEntry.key, never referenceEntryKey, for exactly this
// reason.
type versionedEntry struct {
	key   string
	entry ReferenceEntry
}

// versionsForValue returns every version ever written for (entryType,
// value) -- the full supersession chain, active and deprecated together,
// each paired with its real storage key. A range query on the (type,
// value) prefix: Fabric's real composite-key encoding appends a trailing
// null after every component, which is what guarantees this prefix
// matches every version-suffixed key for this exact value and nothing
// else (e.g. "Aqua" can never match a stored "AquaPlus") -- and, just as
// importantly, also matches a pre-versioning entry's own bare (type,
// value) key, since that key is itself already exactly the prefix.
func (c *RefdataContract) versionsForValue(ctx contractapi.TransactionContextInterface, entryType EntryType, value string) ([]versionedEntry, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("referenceEntry", []string{string(entryType), value})
	if err != nil {
		return nil, fmt.Errorf("failed to query reference entry versions: %w", err)
	}
	defer iterator.Close()

	var versions []versionedEntry
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to read next reference entry version: %w", err)
		}
		var entry ReferenceEntry
		if err := json.Unmarshal(kv.GetValue(), &entry); err != nil {
			return nil, fmt.Errorf("failed to unmarshal reference entry: %w", err)
		}
		versions = append(versions, versionedEntry{key: kv.GetKey(), entry: entry})
	}
	return versions, nil
}

// activeVersion returns whichever of versions currently has status Active.
// By construction (AddReferenceEntry refuses to add a new version while one
// is already active) there is never more than one.
func activeVersion(versions []versionedEntry) *versionedEntry {
	for i := range versions {
		if versions[i].entry.Status == StatusActive {
			return &versions[i]
		}
	}
	return nil
}

// versionNumber parses a ReferenceEntry.Version string for sorting/next-
// version arithmetic. Defaults to 0 on a parse failure rather than erroring
// -- the only writer of this field is this file's own AddReferenceEntry, so
// a non-numeric value would indicate ledger corruption, not a real input to
// validate against.
func versionNumber(v string) int {
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0
	}
	return n
}

func currentTxTimestamp(ctx contractapi.TransactionContextInterface) (string, error) {
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("failed to read transaction timestamp: %w", err)
	}
	return time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC().Format(time.RFC3339), nil
}

// AddReferenceEntry adds a new reference-data entry (FRD-CHAIN-REFDATA-001).
// System Admin only. Rejects adding a value that already has an *active*
// version -- the same duplicate-prevention rule stated for the UI (Screen
// Requirements §12.1) is enforced here first, per this project's one rule
// that matters most: no rule is ever enforced only outside chaincode. If
// every existing version of this value is deprecated, this instead adds the
// *next* version (auto-computed, never client-supplied) and back-fills
// SupersededBy on the version it replaces -- see the type comment on
// ReferenceEntry for why that link belongs here and not in Deprecate.
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

	existingVersions, err := c.versionsForValue(ctx, et, value)
	if err != nil {
		return nil, err
	}
	if activeVersion(existingVersions) != nil {
		return nil, fmt.Errorf("duplicate_entry: an active %s entry with value %q already exists -- deprecate it before adding a new version", entryType, value)
	}

	nextVersion := 1
	var previous *versionedEntry
	maxVersion := 0
	for i := range existingVersions {
		if n := versionNumber(existingVersions[i].entry.Version); n > maxVersion {
			maxVersion = n
			previous = &existingVersions[i]
		}
	}
	if previous != nil {
		nextVersion = maxVersion + 1
	}

	addedBy, err := cid.GetID(ctx.GetStub())
	if err != nil {
		return nil, fmt.Errorf("failed to resolve caller identity: %w", err)
	}

	timestamp, err := currentTxTimestamp(ctx)
	if err != nil {
		return nil, err
	}

	key, err := referenceEntryKey(ctx, et, value, strconv.Itoa(nextVersion))
	if err != nil {
		return nil, fmt.Errorf("failed to build composite key: %w", err)
	}

	entry := ReferenceEntry{
		EntryID:   key,
		Type:      et,
		Value:     value,
		Version:   strconv.Itoa(nextVersion),
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

	if previous != nil {
		previous.entry.SupersededBy = entry.EntryID
		previousJSON, err := json.Marshal(previous.entry)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal superseded reference entry: %w", err)
		}
		// previous.key, not a recomputed referenceEntryKey -- see
		// versionedEntry's comment for why that distinction matters.
		if err := ctx.GetStub().PutState(previous.key, previousJSON); err != nil {
			return nil, fmt.Errorf("failed to write to world state: %w", err)
		}
	}

	return &entry, nil
}

// DeprecateReferenceEntry marks the currently active version of an entry
// deprecated (FRD-CHAIN-REFDATA-002). System Admin only. Rejects
// deprecating a value that was never added, and rejects deprecating
// something already deprecated -- deprecation is a one-way, one-time
// transition per version.
//
// This is the one deliberate exception to "every PutState call in this
// module writes to a brand-new key": it re-writes the active version's own
// key, but only ever to flip Status (and set DeprecatedBy/DeprecatedAt) --
// Type, Value, Version, Metadata, Timestamp, and AddedBy are read back
// unchanged from the existing entry and never altered. That's a
// narrowly-scoped, single-purpose state transition, not the generic
// UpdateReferenceEntry function Guardrails §3a Rule 1 forbids (no function
// here accepts a new Value/Type/Metadata for an existing entry_id).
// Matches docs/05_architecture.md §6's own description of this flow: "mark
// X deprecated (not deleted)."
//
// This function never touches SupersededBy -- the Screen Requirements'
// Deprecate modal is deliberately fieldless (no "replacement" to name), so
// that link is made later, by AddReferenceEntry, when a new version
// actually exists to point at (see ReferenceEntry's type comment).
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

	versions, err := c.versionsForValue(ctx, et, value)
	if err != nil {
		return nil, err
	}
	active := activeVersion(versions)
	if active == nil {
		if len(versions) == 0 {
			return nil, fmt.Errorf("not_a_recognized_value: no %s entry with value %q exists", entryType, value)
		}
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
	active.entry.Status = StatusDeprecated
	active.entry.DeprecatedBy = deprecatedBy
	active.entry.DeprecatedAt = timestamp

	entryJSON, err := json.Marshal(active.entry)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal reference entry: %w", err)
	}

	// active.key, not a recomputed referenceEntryKey -- see versionedEntry's
	// comment for why that distinction matters.
	if err := ctx.GetStub().PutState(active.key, entryJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	return &active.entry, nil
}

// ResolveActiveReference resolves a controlled value against the active
// reference list. `batch` invokes this in the same Fabric transaction used
// to submit an ingredient/supplier/standard reference (TRD §23.1). The
// lookup is a range query (versionsForValue) rather than a single-key read
// now that versioning means multiple keys can exist per value -- Fabric
// records a composite-key range query's own range-query-info in the
// transaction's RWset, which is what still makes a concurrent
// deprecate-then-add produce either a consistent pre-change snapshot or an
// MVCC conflict, never a mixed state (FRD-CHAIN-CONCURRENCY-001, TRD §23.6).
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

	versions, err := c.versionsForValue(ctx, et, value)
	if err != nil {
		return nil, err
	}
	active := activeVersion(versions)
	if active == nil {
		if len(versions) == 0 {
			return nil, fmt.Errorf("not_a_recognized_value: no %s entry with value %q exists", entryType, value)
		}
		return nil, fmt.Errorf("not_a_recognized_value: %s entry %q is deprecated", entryType, value)
	}

	return &active.entry, nil
}

// ReferenceEntryHistoryItem is one point in a reference entry's full
// history -- one per ledger write to that entry's key, oldest first.
type ReferenceEntryHistoryItem struct {
	TxID      string          `json:"tx_id" metadata:"tx_id"`
	Timestamp string          `json:"timestamp" metadata:"timestamp"`
	IsDelete  bool            `json:"is_delete" metadata:"is_delete"`
	Entry     *ReferenceEntry `json:"entry,omitempty" metadata:"entry,optional"`
}

// GetReferenceEntryHistory returns every recorded write across every
// version of a value's whole supersession chain, oldest first
// (FRD-CHAIN-REFDATA-004: "deprecated reference-data entries must remain
// visible in reference-data history, not hidden"). Versioning means a
// value can now span multiple ledger keys (one per version, see
// referenceEntryKey) -- this walks each version's own GetHistoryForKey in
// ascending version order and concatenates them, giving the value's full
// biography (v1 added, v1 deprecated, v2 added, ...) in one list, not just
// the latest version's own history. Concatenating by version order rather
// than sorting by Timestamp is deliberate: each version's own life is
// already fully chronological on its own, and version order doesn't depend
// on wall-clock precision the way a cross-key timestamp sort would.
// IsDelete is always false here since no delete ever happens, included for
// completeness against the iterator's real shape.
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

	versions, err := c.versionsForValue(ctx, et, value)
	if err != nil {
		return nil, err
	}
	if len(versions) == 0 {
		return nil, fmt.Errorf("not_a_recognized_value: no %s entry with value %q exists", entryType, value)
	}
	sort.Slice(versions, func(i, j int) bool {
		return versionNumber(versions[i].entry.Version) < versionNumber(versions[j].entry.Version)
	})

	history := []ReferenceEntryHistoryItem{}
	for _, v := range versions {
		// v.key, not a recomputed referenceEntryKey -- see versionedEntry's
		// comment for why that distinction matters.
		iterator, err := ctx.GetStub().GetHistoryForKey(v.key)
		if err != nil {
			return nil, fmt.Errorf("failed to read history for key: %w", err)
		}
		for iterator.HasNext() {
			mod, err := iterator.Next()
			if err != nil {
				iterator.Close()
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
					iterator.Close()
					return nil, fmt.Errorf("failed to unmarshal historical entry: %w", err)
				}
				item.Entry = &entry
			}

			history = append(history, item)
		}
		iterator.Close()
	}

	return history, nil
}

// ListReferenceEntries returns every entry of a given type -- active and
// deprecated together, deprecated ones always included, never filtered
// out. This is what actually powers the Reference Data List screen
// (docs/11_screen_requirements.md §12), as distinct from
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
