package main

import (
	"strings"
	"testing"
)

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
