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

	record, err := contract.DeprecateReferenceEntry(ctx, "supplier", "PT Distribusi Kosmetik Prima")
	if err != nil {
		t.Fatalf("expected DeprecateReferenceEntry to succeed for System Admin, got error: %v", err)
	}
	if record.EntryID == "" || record.DeprecatedBy == "" || record.Timestamp == "" {
		t.Fatalf("expected a fully populated deprecation record, got: %+v", record)
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
