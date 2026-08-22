package main

import (
	"strings"
	"testing"
)

func TestCreateBatch_IngredientQASucceeds(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed for Ingredient QA, got error: %v", err)
	}
	if batch.IntendedMarket != MarketMalaysia {
		t.Fatalf("expected intended market Malaysia, got %q", batch.IntendedMarket)
	}
	if !strings.HasPrefix(batch.BatchID, "SL-2026-") {
		t.Fatalf("expected batch ID to follow SL-YYYY-NNN using the transaction year, got %q", batch.BatchID)
	}
	if batch.CreatedAt == "" {
		t.Fatal("expected CreatedAt to be system-populated from the transaction timestamp")
	}
}

// FRD-CHAIN-ROLE-005: any role attempting an action outside its permitted
// set must be rejected at the chaincode level. Batch creation is
// Ingredient QA only (UI Flow §8) -- every other role, including System
// Admin, must be rejected.
func TestCreateBatch_OtherRolesRejected(t *testing.T) {
	roles := []string{"production_qa", "compliance_officer", "export_officer", "brand_owner", "system_admin"}

	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			ctx := newIdentityContext(t, "Org1MSP", role)
			contract := &BatchContract{}

			_, err := contract.CreateBatch(ctx, "Malaysia")
			if err == nil {
				t.Fatalf("expected CreateBatch to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

func TestCreateBatch_InvalidMarketRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	_, err := contract.CreateBatch(ctx, "Singapore")
	if err == nil {
		t.Fatal("expected CreateBatch to reject a market outside Indonesia/Malaysia")
	}
	if !strings.Contains(err.Error(), "invalid_market") {
		t.Fatalf("expected an invalid_market rejection, got: %v", err)
	}
}

// Regression test for the casing bug caught during review: values must
// match docs/17_api_reference.md's documented contract exactly
// ("Malaysia", capitalized) -- a lowercase variant is not a silent alias.
func TestCreateBatch_LowercaseMarketRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	_, err := contract.CreateBatch(ctx, "malaysia")
	if err == nil {
		t.Fatal("expected CreateBatch to reject lowercase \"malaysia\" -- the documented value is \"Malaysia\"")
	}
	if !strings.Contains(err.Error(), "invalid_market") {
		t.Fatalf("expected an invalid_market rejection, got: %v", err)
	}
}

// Confirms the SL-YYYY-NNN sequence actually increments rather than
// colliding -- exercises the same contested counter key twice in the same
// transaction year.
func TestCreateBatch_SequentialIDsIncrement(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	first, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected the first CreateBatch call to succeed, got: %v", err)
	}
	second, err := contract.CreateBatch(ctx, "Indonesia")
	if err != nil {
		t.Fatalf("expected the second CreateBatch call to succeed, got: %v", err)
	}

	if first.BatchID != "SL-2026-001" {
		t.Fatalf("expected the first batch ID to be SL-2026-001, got %q", first.BatchID)
	}
	if second.BatchID != "SL-2026-002" {
		t.Fatalf("expected the second batch ID to be SL-2026-002, got %q", second.BatchID)
	}
	if second.IntendedMarket != MarketIndonesia {
		t.Fatalf("expected the second batch's own intended market to be Indonesia, got %q", second.IntendedMarket)
	}
}

func TestSubmitIngredient_IngredientQASucceeds(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}

	stubResolveActiveReference(ctx.stub, "ingredient", "Aqua", "referenceEntry-ingredient-Aqua", "1", `{"defaultHalalRisk":false}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "referenceEntry-supplier-PT-Sumber", "1", "")

	record, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "")
	if err != nil {
		t.Fatalf("expected SubmitIngredient to succeed, got: %v", err)
	}

	if record.BatchID != batch.BatchID {
		t.Fatalf("expected BatchID %q, got %q", batch.BatchID, record.BatchID)
	}
	if record.IngredientNameSnapshot != "Aqua" || record.IngredientReferenceEntryID != "referenceEntry-ingredient-Aqua" || record.IngredientReferenceVersion != "1" {
		t.Fatalf("expected the ingredient snapshot to match the resolved reference, got: %+v", record)
	}
	if record.SourceSnapshot != "PT Sumber Alam Nusantara" || record.SupplierReferenceEntryID != "referenceEntry-supplier-PT-Sumber" {
		t.Fatalf("expected the supplier snapshot to match the resolved reference, got: %+v", record)
	}
	if record.HalalRiskFlag != false {
		t.Fatalf("expected HalalRiskFlag to auto-populate false from the reference entry's default, got: %v", record.HalalRiskFlag)
	}
	if record.OverrideReason != "" {
		t.Fatalf("expected no override reason when isOverride is false, got: %q", record.OverrideReason)
	}
	if record.RecordID == "" || record.Timestamp == "" || record.SubmittedBy == "" {
		t.Fatalf("expected RecordID/Timestamp/SubmittedBy to be populated, got: %+v", record)
	}
}

// FRD-CHAIN-ROLE-001: Ingredient QA may submit ingredient records only.
func TestSubmitIngredient_OtherRolesRejected(t *testing.T) {
	adminCtx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	admin := &BatchContract{}
	batch, err := admin.CreateBatch(adminCtx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(adminCtx.stub, "ingredient", "Aqua", "e1", "1", "")
	stubResolveActiveReference(adminCtx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", "")

	roles := []string{"production_qa", "compliance_officer", "export_officer", "brand_owner", "system_admin"}
	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			ctx := adminCtx.actingAs(t, "Org1MSP", role)
			contract := &BatchContract{}

			_, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "")
			if err == nil {
				t.Fatalf("expected SubmitIngredient to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

func TestSubmitIngredient_NonexistentBatchRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	stubResolveActiveReference(ctx.stub, "ingredient", "Aqua", "e1", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", "")

	_, err := contract.SubmitIngredient(ctx, "SL-2026-999", "Aqua", "PT Sumber Alam Nusantara", false, false, "")
	if err == nil {
		t.Fatal("expected SubmitIngredient to reject a batch ID that was never created")
	}
	if !strings.Contains(err.Error(), "batch_not_found") {
		t.Fatalf("expected a batch_not_found rejection, got: %v", err)
	}
}

// FRD-CHAIN-UPLOAD-009: batch chaincode must validate through refdata's
// on-ledger contract on every submission path -- an unrecognized ingredient
// is rejected with refdata's own not_a_recognized_value reason, propagated
// unchanged across the cross-chaincode call.
func TestSubmitIngredient_UnrecognizedIngredientRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReferenceRejected(ctx.stub, "ingredient", "Not A Real Ingredient")

	_, err = contract.SubmitIngredient(ctx, batch.BatchID, "Not A Real Ingredient", "PT Sumber Alam Nusantara", false, false, "")
	if err == nil {
		t.Fatal("expected SubmitIngredient to reject an unrecognized ingredient")
	}
	if !strings.Contains(err.Error(), "not_a_recognized_value") {
		t.Fatalf("expected a not_a_recognized_value rejection, got: %v", err)
	}
}

func TestSubmitIngredient_UnrecognizedSupplierRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Aqua", "e1", "1", "")
	stubResolveActiveReferenceRejected(ctx.stub, "supplier", "Not A Real Supplier")

	_, err = contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "Not A Real Supplier", false, false, "")
	if err == nil {
		t.Fatal("expected SubmitIngredient to reject an unrecognized supplier")
	}
	if !strings.Contains(err.Error(), "not_a_recognized_value") {
		t.Fatalf("expected a not_a_recognized_value rejection, got: %v", err)
	}
}

// FRD-CHAIN-UPLOAD-008: overriding the default Halal Risk classification
// requires an explicit, recorded reason.
func TestSubmitIngredient_OverrideWithoutReasonRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Cetyl Alcohol", "e1", "1", `{"defaultHalalRisk":true}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Kimia Hijau Indonesia", "e2", "1", "")

	_, err = contract.SubmitIngredient(ctx, batch.BatchID, "Cetyl Alcohol", "PT Kimia Hijau Indonesia", true, false, "")
	if err == nil {
		t.Fatal("expected SubmitIngredient to reject an override with no reason given")
	}
	if !strings.Contains(err.Error(), "missing_field") {
		t.Fatalf("expected a missing_field rejection, got: %v", err)
	}
}

func TestSubmitIngredient_OverrideWithReasonRecorded(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Cetyl Alcohol", "e1", "1", `{"defaultHalalRisk":true}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Kimia Hijau Indonesia", "e2", "1", "")

	record, err := contract.SubmitIngredient(
		ctx, batch.BatchID, "Cetyl Alcohol", "PT Kimia Hijau Indonesia",
		true, false, "Verified plant-derived source, documented on file",
	)
	if err != nil {
		t.Fatalf("expected SubmitIngredient to succeed with a recorded override reason, got: %v", err)
	}
	if record.HalalRiskFlag != false {
		t.Fatalf("expected the override to set HalalRiskFlag to false, got: %v", record.HalalRiskFlag)
	}
	if record.OverrideReason != "Verified plant-derived source, documented on file" {
		t.Fatalf("expected the override reason to be recorded, got: %q", record.OverrideReason)
	}
}

// Multiple ingredients on the same batch must each get a distinct record,
// none of them touching or replacing another.
func TestSubmitIngredient_MultipleIngredientsOnSameBatch(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Aqua", "e1", "1", "")
	stubResolveActiveReference(ctx.stub, "ingredient", "Glycerin", "e2", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e3", "1", "")

	ctx.stub.txID = "tx-1"
	first, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "")
	if err != nil {
		t.Fatalf("expected the first SubmitIngredient call to succeed, got: %v", err)
	}
	ctx.stub.txID = "tx-2"
	second, err := contract.SubmitIngredient(ctx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "")
	if err != nil {
		t.Fatalf("expected the second SubmitIngredient call to succeed, got: %v", err)
	}

	if first.RecordID == second.RecordID {
		t.Fatalf("expected distinct record IDs, both were %q", first.RecordID)
	}
	if first.IngredientNameSnapshot == second.IngredientNameSnapshot {
		t.Fatalf("expected distinct ingredient snapshots, both were %q", first.IngredientNameSnapshot)
	}
}
