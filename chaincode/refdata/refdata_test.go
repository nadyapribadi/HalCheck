package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// plantLegacyEntry writes a ReferenceEntry directly under the pre-
// versioning (type, value) 2-component key -- no version suffix -- exactly
// how every entry looked before this redesign. Bypasses AddReferenceEntry
// entirely, unlike every other test in this file: this exists specifically
// to catch the class of bug where a function reconstructs an entry's key
// from its own (type, value, version) fields instead of reusing the key it
// was actually read from, which silently breaks for entries whose real key
// predates the version component. That exact bug shipped past all the
// other tests in this file (all of which only ever exercise entries
// created by this file's own current AddReferenceEntry, where the two key
// forms happen to coincide) and was only caught live, against real
// pre-existing network data.
func plantLegacyEntry(t *testing.T, ctx *mockTransactionContext, entryType, value string) {
	t.Helper()
	key, err := ctx.stub.CreateCompositeKey("referenceEntry", []string{entryType, value})
	if err != nil {
		t.Fatalf("failed to build legacy composite key: %v", err)
	}
	entry := ReferenceEntry{
		EntryID:   key,
		Type:      EntryType(entryType),
		Value:     value,
		Version:   "1",
		Status:    StatusActive,
		Timestamp: "2026-01-01T00:00:00Z",
		AddedBy:   "legacy-identity",
	}
	entryJSON, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("failed to marshal legacy entry: %v", err)
	}
	if err := ctx.stub.PutState(key, entryJSON); err != nil {
		t.Fatalf("failed to plant legacy entry: %v", err)
	}
}

func TestAddReferenceEntry_SystemAdminSucceeds(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	entry, err := contract.AddReferenceEntry(ctx, "ingredient", "Aqua", `{"defaultHalalRisk":false}`)
	if err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed for System Admin, got error: %v", err)
	}
	if entry.Type != EntryTypeIngredient || entry.Value != "Aqua" {
		t.Fatalf("unexpected entry content: %+v", entry)
	}
	if entry.Version != "1" {
		t.Fatalf("expected a new entry's version to be \"1\", got %q", entry.Version)
	}
	if entry.EntryID == "" {
		t.Fatal("expected a non-empty EntryID")
	}
	if entry.Status != StatusActive {
		t.Fatalf("expected a new entry's status to be %q, got %q", StatusActive, entry.Status)
	}
	if entry.SupersededBy != "" || entry.DeprecatedBy != "" || entry.DeprecatedAt != "" {
		t.Fatalf("expected a new entry to have no deprecation fields set, got: %+v", entry)
	}
}

// FRD-CHAIN-REFDATA-006 / Guardrails §3a Rule 3: every add function needs a
// negative test attempting the action as a non-System-Admin identity.
func TestAddReferenceEntry_NonSystemAdminRejected(t *testing.T) {
	roles := []string{"ingredient_qa", "production_qa", "compliance_officer", "export_officer", "brand_owner"}

	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			ctx := newIdentityContext(t, "Org1MSP", role)
			contract := &RefdataContract{}

			_, err := contract.AddReferenceEntry(ctx, "ingredient", "Aqua", "")
			if err == nil {
				t.Fatalf("expected AddReferenceEntry to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

// An identity with no role attribute at all must also be rejected -- not
// treated as an edge case that slips through.
func TestAddReferenceEntry_MissingRoleAttributeRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "")
	contract := &RefdataContract{}

	_, err := contract.AddReferenceEntry(ctx, "ingredient", "Aqua", "")
	if err == nil {
		t.Fatal("expected AddReferenceEntry to reject an identity with no role attribute")
	}
	if !strings.Contains(err.Error(), "role_scope_violation") {
		t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
	}
}

func TestAddReferenceEntry_InvalidEntryTypeRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	_, err := contract.AddReferenceEntry(ctx, "not_a_real_type", "Aqua", "")
	if err == nil {
		t.Fatal("expected AddReferenceEntry to reject an unrecognized entry type")
	}
	if !strings.Contains(err.Error(), "invalid_entry_type") {
		t.Fatalf("expected an invalid_entry_type rejection, got: %v", err)
	}
}

func TestAddReferenceEntry_DuplicateRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "supplier", "PT Sumber Alam Nusantara", ""); err != nil {
		t.Fatalf("expected the first AddReferenceEntry call to succeed, got: %v", err)
	}

	_, err := contract.AddReferenceEntry(ctx, "supplier", "PT Sumber Alam Nusantara", "")
	if err == nil {
		t.Fatal("expected a duplicate (type, value) pair to be rejected")
	}
	if !strings.Contains(err.Error(), "duplicate_entry") {
		t.Fatalf("expected a duplicate_entry rejection, got: %v", err)
	}
}

// TRD line 156: versioning is "supersede-only, matching the
// batch-correction pattern" -- once the only existing version of a value is
// deprecated, adding it again is not a duplicate, it's the next version.
func TestAddReferenceEntry_NewVersionAfterDeprecationSucceeds(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	v1, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", `{"citation":"BPOM Regulation No. 33/2021"}`)
	if err != nil {
		t.Fatalf("expected the first AddReferenceEntry call to succeed, got: %v", err)
	}
	if _, err := contract.DeprecateReferenceEntry(ctx, "standard", "CPKB"); err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed, got: %v", err)
	}

	v2, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", `{"citation":"BPOM Regulation No. 33/2021, Rev. 2"}`)
	if err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed for a new version after deprecation, got: %v", err)
	}
	if v2.Version != "2" {
		t.Fatalf("expected the new version to be \"2\", got %q", v2.Version)
	}
	if v2.EntryID == v1.EntryID {
		t.Fatal("expected the new version to get its own distinct EntryID, not overwrite the old one")
	}
	if v2.Status != StatusActive {
		t.Fatalf("expected the new version to be active, got %q", v2.Status)
	}

	// The old version must be readable, unchanged except for the
	// SupersededBy backfill -- this is the one write path SupersededBy has.
	history, err := contract.GetReferenceEntryHistory(ctx, "standard", "CPKB")
	if err != nil {
		t.Fatalf("expected GetReferenceEntryHistory to succeed, got: %v", err)
	}
	var v1AfterSupersession *ReferenceEntry
	for _, item := range history {
		if item.Entry != nil && item.Entry.Version == "1" && item.Entry.Status == StatusDeprecated {
			v1AfterSupersession = item.Entry
		}
	}
	if v1AfterSupersession == nil {
		t.Fatal("expected to find version 1's deprecated state in history")
	}
	if v1AfterSupersession.SupersededBy != v2.EntryID {
		t.Fatalf("expected version 1's SupersededBy to point at version 2's EntryID %q, got %q", v2.EntryID, v1AfterSupersession.SupersededBy)
	}
}

// Distinguishes from TestAddReferenceEntry_DuplicateRejected: this proves
// the rejection is specifically about an *active* version existing, not
// about the value ever having existed at all.
func TestAddReferenceEntry_ActiveVersionStillBlocksReAdd(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}

	_, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", "")
	if err == nil {
		t.Fatal("expected AddReferenceEntry to reject a re-add while the existing version is still active")
	}
	if !strings.Contains(err.Error(), "duplicate_entry") {
		t.Fatalf("expected a duplicate_entry rejection, got: %v", err)
	}
}

func TestAddReferenceEntry_MissingValueRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	_, err := contract.AddReferenceEntry(ctx, "ingredient", "", "")
	if err == nil {
		t.Fatal("expected AddReferenceEntry to reject an empty value")
	}
	if !strings.Contains(err.Error(), "missing_field") {
		t.Fatalf("expected a missing_field rejection, got: %v", err)
	}
}

func TestDeprecateReferenceEntry_SystemAdminSucceeds(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}

	entry, err := contract.DeprecateReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima")
	if err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed for System Admin, got error: %v", err)
	}
	if entry.Status != StatusDeprecated {
		t.Fatalf("expected Status to be %q, got %q", StatusDeprecated, entry.Status)
	}
	if entry.DeprecatedBy == "" || entry.DeprecatedAt == "" {
		t.Fatalf("expected DeprecatedBy/DeprecatedAt to be populated, got: %+v", entry)
	}
	// Everything else about the entry must be exactly what AddReferenceEntry
	// wrote -- deprecation is a narrowly-scoped flip, not a rewrite.
	if entry.Value != "PT Distribusi Kosmetik Prima" || entry.Type != EntryTypeSupplier || entry.Version != "1" {
		t.Fatalf("expected the entry's original fields to survive deprecation unchanged, got: %+v", entry)
	}
}

func TestDeprecateReferenceEntry_NonSystemAdminRejected(t *testing.T) {
	adminCtx := newIdentityContext(t, "Org1MSP", "system_admin")
	adminContract := &RefdataContract{}
	if _, err := adminContract.AddReferenceEntry(adminCtx, "supplier", "PT Distribusi Kosmetik Prima", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}

	roles := []string{"ingredient_qa", "production_qa", "compliance_officer", "export_officer", "brand_owner"}
	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			// Same underlying ledger state as adminCtx, different identity --
			// a real "wrong role, existing entry" attempt, not a coincidental
			// not-found rejection.
			ctx := adminCtx.actingAs(t, "Org1MSP", role)

			contract := &RefdataContract{}
			_, err := contract.DeprecateReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima")
			if err == nil {
				t.Fatalf("expected DeprecateReferenceEntry to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

func TestDeprecateReferenceEntry_UnknownEntryRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	_, err := contract.DeprecateReferenceEntry(ctx, "supplier", "Never Added Supplier")
	if err == nil {
		t.Fatal("expected DeprecateReferenceEntry to reject a value that was never added")
	}
	if !strings.Contains(err.Error(), "not_a_recognized_value") {
		t.Fatalf("expected a not_a_recognized_value rejection, got: %v", err)
	}
}

func TestDeprecateReferenceEntry_DoubleDeprecationRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.DeprecateReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima"); err != nil {
		t.Fatalf("expected the first DeprecateReferenceEntry call to succeed, got: %v", err)
	}

	_, err := contract.DeprecateReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima")
	if err == nil {
		t.Fatal("expected a second deprecation of the same entry to be rejected")
	}
	if !strings.Contains(err.Error(), "already_deprecated") {
		t.Fatalf("expected an already_deprecated rejection, got: %v", err)
	}
}

func TestResolveActiveReference_ActiveEntryResolves(t *testing.T) {
	adminCtx := newIdentityContext(t, "Org1MSP", "system_admin")
	admin := &RefdataContract{}
	added, err := admin.AddReferenceEntry(adminCtx, "ingredient", "Aqua", `{"defaultHalalRisk":false}`)
	if err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}

	// Resolved by a submitting role, not System Admin -- proves this read
	// path carries no role restriction (unlike the two write functions above).
	ctx := adminCtx.actingAs(t, "Org1MSP", "ingredient_qa")
	contract := &RefdataContract{}

	resolved, err := contract.ResolveActiveReference(ctx, "ingredient", "Aqua")
	if err != nil {
		t.Fatalf("expected ResolveActiveReference to succeed for an active entry, got: %v", err)
	}
	if resolved.EntryID != added.EntryID || resolved.Version != added.Version {
		t.Fatalf("expected the resolved entry to match what was added, got: %+v", resolved)
	}
}

func TestResolveActiveReference_UnknownValueRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &RefdataContract{}

	_, err := contract.ResolveActiveReference(ctx, "ingredient", "Not A Real Ingredient")
	if err == nil {
		t.Fatal("expected ResolveActiveReference to reject an unknown value")
	}
	if !strings.Contains(err.Error(), "not_a_recognized_value") {
		t.Fatalf("expected a not_a_recognized_value rejection, got: %v", err)
	}
}

// FRD-CHAIN-UPLOAD-009: a value not present in the *current* reference list
// must be rejected the same way whether it was never added or has since
// been deprecated -- a deprecated entry is not a valid submission target.
func TestResolveActiveReference_DeprecatedEntryRejected(t *testing.T) {
	adminCtx := newIdentityContext(t, "Org1MSP", "system_admin")
	admin := &RefdataContract{}
	if _, err := admin.AddReferenceEntry(adminCtx, "supplier", "PT Distribusi Kosmetik Prima", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := admin.DeprecateReferenceEntry(adminCtx, "supplier", "PT Distribusi Kosmetik Prima"); err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed, got: %v", err)
	}

	contract := &RefdataContract{}
	_, err := contract.ResolveActiveReference(adminCtx, "supplier", "PT Distribusi Kosmetik Prima")
	if err == nil {
		t.Fatal("expected ResolveActiveReference to reject a deprecated entry")
	}
	if !strings.Contains(err.Error(), "not_a_recognized_value") {
		t.Fatalf("expected a not_a_recognized_value rejection, got: %v", err)
	}
}

// FRD-CHAIN-REFDATA-005: new submissions must resolve against the
// currently active version, not a stale one -- proves resolution actually
// follows the supersession chain rather than sticking to whatever was
// active first.
func TestResolveActiveReference_ResolvesLatestVersionAfterSupersession(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	admin := &RefdataContract{}
	if _, err := admin.AddReferenceEntry(ctx, "standard", "CPKB", ""); err != nil {
		t.Fatalf("expected the first AddReferenceEntry call to succeed, got: %v", err)
	}
	if _, err := admin.DeprecateReferenceEntry(ctx, "standard", "CPKB"); err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed, got: %v", err)
	}
	v2, err := admin.AddReferenceEntry(ctx, "standard", "CPKB", "")
	if err != nil {
		t.Fatalf("expected the second AddReferenceEntry call to succeed, got: %v", err)
	}

	contract := &RefdataContract{}
	resolved, err := contract.ResolveActiveReference(ctx, "standard", "CPKB")
	if err != nil {
		t.Fatalf("expected ResolveActiveReference to succeed, got: %v", err)
	}
	if resolved.EntryID != v2.EntryID || resolved.Version != "2" {
		t.Fatalf("expected resolution to return version 2 (the current active version), got: %+v", resolved)
	}
}

func TestResolveActiveReference_InvalidEntryTypeRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &RefdataContract{}

	_, err := contract.ResolveActiveReference(ctx, "not_a_real_type", "Aqua")
	if err == nil {
		t.Fatal("expected ResolveActiveReference to reject an unrecognized entry type")
	}
	if !strings.Contains(err.Error(), "invalid_entry_type") {
		t.Fatalf("expected an invalid_entry_type rejection, got: %v", err)
	}
}

// FRD-CHAIN-REFDATA-004: deprecated entries must remain visible in history,
// not hidden. This proves the pre-deprecation state is actually
// retrievable through a chaincode function, not just theoretically
// recoverable at the ledger level.
func TestGetReferenceEntryHistory_ShowsBothVersions(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.DeprecateReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima"); err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed, got: %v", err)
	}

	history, err := contract.GetReferenceEntryHistory(ctx, "supplier", "PT Distribusi Kosmetik Prima")
	if err != nil {
		t.Fatalf("expected GetReferenceEntryHistory to succeed, got: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("expected 2 history entries (add, then deprecate), got %d: %+v", len(history), history)
	}

	if history[0].Entry == nil || history[0].Entry.Status != StatusActive {
		t.Fatalf("expected the first (oldest) history entry to show status active, got: %+v", history[0])
	}
	if history[1].Entry == nil || history[1].Entry.Status != StatusDeprecated {
		t.Fatalf("expected the second (newest) history entry to show status deprecated, got: %+v", history[1])
	}
	// The substantive fields must be identical across both versions --
	// deprecation only ever flips status/deprecated_by/deprecated_at.
	if history[0].Entry.Value != history[1].Entry.Value || history[0].Entry.Version != history[1].Entry.Version {
		t.Fatalf("expected Value/Version to be unchanged across history, got: %+v vs %+v", history[0].Entry, history[1].Entry)
	}
}

// The full biography test: history must span every version's own writes,
// in chronological order, not just the latest version's history.
func TestGetReferenceEntryHistory_SpansMultipleVersions(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", ""); err != nil {
		t.Fatalf("expected v1 AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.DeprecateReferenceEntry(ctx, "standard", "CPKB"); err != nil {
		t.Fatalf("expected v1 DeprecateReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", ""); err != nil {
		t.Fatalf("expected v2 AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.DeprecateReferenceEntry(ctx, "standard", "CPKB"); err != nil {
		t.Fatalf("expected v2 DeprecateReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", ""); err != nil {
		t.Fatalf("expected v3 AddReferenceEntry to succeed, got: %v", err)
	}

	history, err := contract.GetReferenceEntryHistory(ctx, "standard", "CPKB")
	if err != nil {
		t.Fatalf("expected GetReferenceEntryHistory to succeed, got: %v", err)
	}
	// Each version gets 3 writes of its own except the last: add, deprecate,
	// and a SupersededBy backfill written later by the *next* version's own
	// AddReferenceEntry call (a separate PutState, not folded into the
	// deprecate write -- Deprecate is fieldless and doesn't know about a
	// future version yet). v1: add, deprecate, backfill-from-v2 = 3. v2:
	// add, deprecate, backfill-from-v3 = 3. v3: add only (nothing supersedes
	// it yet) = 1. Total 7.
	if len(history) != 7 {
		t.Fatalf("expected 7 history entries across all 3 versions, got %d: %+v", len(history), history)
	}

	type want struct {
		version      string
		status       EntryStatus
		supersededBy bool // whether SupersededBy should be non-empty
	}
	wants := []want{
		{"1", StatusActive, false},     // v1 added
		{"1", StatusDeprecated, false}, // v1 deprecated
		{"1", StatusDeprecated, true},  // v1 backfilled once v2 exists
		{"2", StatusActive, false},     // v2 added
		{"2", StatusDeprecated, false}, // v2 deprecated
		{"2", StatusDeprecated, true},  // v2 backfilled once v3 exists
		{"3", StatusActive, false},     // v3 added, nothing supersedes it yet
	}
	for i, w := range wants {
		entry := history[i].Entry
		if entry == nil {
			t.Fatalf("expected history[%d].Entry to be populated, got nil", i)
		}
		if entry.Version != w.version {
			t.Fatalf("expected history[%d].Entry.Version %q, got %q", i, w.version, entry.Version)
		}
		if entry.Status != w.status {
			t.Fatalf("expected history[%d].Entry.Status %q, got %q", i, w.status, entry.Status)
		}
		if hasSupersededBy := entry.SupersededBy != ""; hasSupersededBy != w.supersededBy {
			t.Fatalf("expected history[%d].Entry.SupersededBy non-empty=%v, got %q", i, w.supersededBy, entry.SupersededBy)
		}
	}
}

func TestGetReferenceEntryHistory_UnknownValueRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &RefdataContract{}

	_, err := contract.GetReferenceEntryHistory(ctx, "supplier", "Never Added Supplier")
	if err == nil {
		t.Fatal("expected GetReferenceEntryHistory to reject a value that was never added")
	}
	if !strings.Contains(err.Error(), "not_a_recognized_value") {
		t.Fatalf("expected a not_a_recognized_value rejection, got: %v", err)
	}
}

func TestGetReferenceEntryHistory_InvalidEntryTypeRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &RefdataContract{}

	_, err := contract.GetReferenceEntryHistory(ctx, "not_a_real_type", "Aqua")
	if err == nil {
		t.Fatal("expected GetReferenceEntryHistory to reject an unrecognized entry type")
	}
	if !strings.Contains(err.Error(), "invalid_entry_type") {
		t.Fatalf("expected an invalid_entry_type rejection, got: %v", err)
	}
}

// FRD-CHAIN-REFDATA-004, the UI-facing half: the Reference Data List
// screen (docs/12 §12) shows every entry of a type, deprecated ones muted
// but never filtered out. This proves a deprecated entry still appears in
// that listing, not just recoverable via GetReferenceEntryHistory.
func TestListReferenceEntries_IncludesActiveAndDeprecated(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "supplier", "PT Sumber Alam Nusantara", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.AddReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.DeprecateReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima"); err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed, got: %v", err)
	}

	entries, err := contract.ListReferenceEntries(ctx, "supplier")
	if err != nil {
		t.Fatalf("expected ListReferenceEntries to succeed, got: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected both the active and the deprecated entry to be listed, got %d: %+v", len(entries), entries)
	}

	byValue := map[string]*ReferenceEntry{}
	for _, entry := range entries {
		byValue[entry.Value] = entry
	}
	if byValue["PT Sumber Alam Nusantara"] == nil || byValue["PT Sumber Alam Nusantara"].Status != StatusActive {
		t.Fatalf("expected PT Sumber Alam Nusantara to be listed as active, got: %+v", byValue)
	}
	if byValue["PT Distribusi Kosmetik Prima"] == nil || byValue["PT Distribusi Kosmetik Prima"].Status != StatusDeprecated {
		t.Fatalf("expected PT Distribusi Kosmetik Prima to be listed as deprecated, not filtered out, got: %+v", byValue)
	}
}

// Each version now lives at its own key, so a superseded value must show
// up as its own separate row -- more complete than a single mutated row,
// and still exactly what FRD-CHAIN-REFDATA-004 requires (deprecated
// entries visible, not hidden).
func TestListReferenceEntries_ListsEachVersionSeparately(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", ""); err != nil {
		t.Fatalf("expected v1 AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.DeprecateReferenceEntry(ctx, "standard", "CPKB"); err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", ""); err != nil {
		t.Fatalf("expected v2 AddReferenceEntry to succeed, got: %v", err)
	}

	entries, err := contract.ListReferenceEntries(ctx, "standard")
	if err != nil {
		t.Fatalf("expected ListReferenceEntries to succeed, got: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected both versions of CPKB to be listed separately, got %d: %+v", len(entries), entries)
	}

	byVersion := map[string]*ReferenceEntry{}
	for _, entry := range entries {
		byVersion[entry.Version] = entry
	}
	if byVersion["1"] == nil || byVersion["1"].Status != StatusDeprecated {
		t.Fatalf("expected version 1 to be listed as deprecated, got: %+v", byVersion["1"])
	}
	if byVersion["2"] == nil || byVersion["2"].Status != StatusActive {
		t.Fatalf("expected version 2 to be listed as active, got: %+v", byVersion["2"])
	}
}

func TestListReferenceEntries_OnlyReturnsMatchingType(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	if _, err := contract.AddReferenceEntry(ctx, "ingredient", "Aqua", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}
	if _, err := contract.AddReferenceEntry(ctx, "supplier", "PT Sumber Alam Nusantara", ""); err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed, got: %v", err)
	}

	entries, err := contract.ListReferenceEntries(ctx, "ingredient")
	if err != nil {
		t.Fatalf("expected ListReferenceEntries to succeed, got: %v", err)
	}
	if len(entries) != 1 || entries[0].Value != "Aqua" {
		t.Fatalf("expected only the ingredient entry, got: %+v", entries)
	}
}

func TestListReferenceEntries_EmptyForUnusedType(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	contract := &RefdataContract{}

	entries, err := contract.ListReferenceEntries(ctx, "fail_reason")
	if err != nil {
		t.Fatalf("expected ListReferenceEntries to succeed even with nothing added yet, got: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected an empty list, got: %+v", entries)
	}
}

func TestListReferenceEntries_InvalidEntryTypeRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &RefdataContract{}

	_, err := contract.ListReferenceEntries(ctx, "not_a_real_type")
	if err == nil {
		t.Fatal("expected ListReferenceEntries to reject an unrecognized entry type")
	}
	if !strings.Contains(err.Error(), "invalid_entry_type") {
		t.Fatalf("expected an invalid_entry_type rejection, got: %v", err)
	}
}

// Regression test for a bug caught live, not by any test above: Deprecate
// must update the entry at the key it actually lives at, not a key
// recomputed from (type, value, version) -- which only coincides with the
// real key for entries created after the versioning redesign. Against a
// pre-existing legacy entry, the old (buggy) code silently wrote the
// deprecated copy to a brand-new, different key, leaving the original
// untouched and still reporting active.
func TestDeprecateReferenceEntry_SucceedsAgainstLegacyKeyFormat(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	plantLegacyEntry(t, ctx, "standard", "CPKB")
	contract := &RefdataContract{}

	entry, err := contract.DeprecateReferenceEntry(ctx, "standard", "CPKB")
	if err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed against a legacy-format entry, got: %v", err)
	}
	if entry.Status != StatusDeprecated {
		t.Fatalf("expected Status to be %q, got %q", StatusDeprecated, entry.Status)
	}

	resolved, err := contract.ResolveActiveReference(ctx, "standard", "CPKB")
	if err == nil {
		t.Fatalf("expected ResolveActiveReference to find no active version after deprecation, got: %+v", resolved)
	}
	if !strings.Contains(err.Error(), "not_a_recognized_value") {
		t.Fatalf("expected a not_a_recognized_value rejection, got: %v", err)
	}
}

// The other half of the same regression: once a legacy entry is
// deprecated, adding again must succeed as version 2 -- proving the
// duplicate_entry check also correctly sees the legacy entry as no longer
// active, not just that Deprecate's own return value looked right.
func TestAddReferenceEntry_NewVersionAfterDeprecatingLegacyEntrySucceeds(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "system_admin")
	plantLegacyEntry(t, ctx, "standard", "CPKB")
	contract := &RefdataContract{}

	if _, err := contract.DeprecateReferenceEntry(ctx, "standard", "CPKB"); err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed, got: %v", err)
	}

	v2, err := contract.AddReferenceEntry(ctx, "standard", "CPKB", "")
	if err != nil {
		t.Fatalf("expected AddReferenceEntry to succeed as a new version after deprecating the legacy entry, got: %v", err)
	}
	if v2.Version != "2" {
		t.Fatalf("expected the new version to be \"2\", got %q", v2.Version)
	}

	resolved, err := contract.ResolveActiveReference(ctx, "standard", "CPKB")
	if err != nil {
		t.Fatalf("expected ResolveActiveReference to succeed, got: %v", err)
	}
	if resolved.EntryID != v2.EntryID {
		t.Fatalf("expected resolution to return the new version, got: %+v", resolved)
	}

	history, err := contract.GetReferenceEntryHistory(ctx, "standard", "CPKB")
	if err != nil {
		t.Fatalf("expected GetReferenceEntryHistory to succeed, got: %v", err)
	}
	// Legacy key gets 3 writes (planted active, deprecated, then backfilled
	// with SupersededBy once v2 exists); v2's own key gets 1 (its add) --
	// same 3-writes-per-superseded-version shape as
	// TestGetReferenceEntryHistory_SpansMultipleVersions, just starting
	// from a planted legacy entry instead of a fresh AddReferenceEntry call.
	if len(history) != 4 {
		t.Fatalf("expected 4 history entries (legacy add, legacy deprecate, legacy backfill, v2 add), got %d: %+v", len(history), history)
	}
	if history[3].Entry == nil || history[3].Entry.EntryID != v2.EntryID {
		t.Fatalf("expected the last history entry to be v2's own add, got: %+v", history[3])
	}
}
