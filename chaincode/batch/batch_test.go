package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
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
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "referenceEntry-supplier-PT-Sumber", "1", verifiedSupplier)

	record, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "", "")
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
	stubResolveActiveReference(adminCtx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", verifiedSupplier)

	roles := []string{"production_qa", "compliance_officer", "export_officer", "brand_owner", "system_admin"}
	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			ctx := adminCtx.actingAs(t, "Org1MSP", role)
			contract := &BatchContract{}

			_, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "", "")
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
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", verifiedSupplier)

	_, err := contract.SubmitIngredient(ctx, "SL-2026-999", "Aqua", "PT Sumber Alam Nusantara", false, false, "", "")
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

	_, err = contract.SubmitIngredient(ctx, batch.BatchID, "Not A Real Ingredient", "PT Sumber Alam Nusantara", false, false, "", "")
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

	_, err = contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "Not A Real Supplier", false, false, "", "")
	if err == nil {
		t.Fatal("expected SubmitIngredient to reject an unrecognized supplier")
	}
	if !strings.Contains(err.Error(), "not_a_recognized_value") {
		t.Fatalf("expected a not_a_recognized_value rejection, got: %v", err)
	}
}

// ADR-CT-033: the supplier's verification status decides the verdict
// engine's unverified_ingredient_source rule, and the signed attestation
// binds only the batch's own records -- so the fact has to travel with the
// record rather than being looked up from a second owner at verdict time.
// Snapshotted from the resolved supplier entry's own metadata, and stored
// under the exact JSON key the backend's verdict bridge reads.
func TestSubmitIngredient_SnapshotsSupplierVerificationStatus(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Cetyl Alcohol", "e1", "1", `{"defaultHalalRisk":true}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", verifiedSupplier)

	record, err := contract.SubmitIngredient(ctx, batch.BatchID, "Cetyl Alcohol", "PT Sumber Alam Nusantara", false, false, "", "")
	if err != nil {
		t.Fatalf("expected SubmitIngredient to succeed, got: %v", err)
	}
	if record.SupplierVerificationStatus != "verified" {
		t.Fatalf("expected the supplier's verification status to be snapshotted as \"verified\", got %q", record.SupplierVerificationStatus)
	}

	// The backend's bridge reads this exact key out of GetBatchTrail, so
	// the serialized field name is part of the contract between the two
	// modules, not an incidental Go detail.
	marshalled, err := json.Marshal(record)
	if err != nil {
		t.Fatalf("failed to marshal the record: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(marshalled, &decoded); err != nil {
		t.Fatalf("failed to unmarshal the record's own JSON: %v", err)
	}
	if decoded["supplier_verification_status"] != "verified" {
		t.Fatalf("expected the record's JSON to carry supplier_verification_status, got: %s", marshalled)
	}
}

// The unverified case has to survive the same path -- a status the engine
// reads as "not verified" is a real, recordable fact, not an error.
func TestSubmitIngredient_SnapshotsUnverifiedSupplierStatus(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Cetyl Alcohol", "e1", "1", `{"defaultHalalRisk":true}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Distribusi Kosmetik Prima", "e2", "1", unverifiedSupplier)

	record, err := contract.SubmitIngredient(ctx, batch.BatchID, "Cetyl Alcohol", "PT Distribusi Kosmetik Prima", false, false, "", "")
	if err != nil {
		t.Fatalf("expected SubmitIngredient to succeed, got: %v", err)
	}
	if record.SupplierVerificationStatus != "unverified" {
		t.Fatalf("expected \"unverified\" to be snapshotted as-is, got %q", record.SupplierVerificationStatus)
	}
}

// batch does not own the reference-data vocabulary -- refdata does (and the
// System Admin sets it). So an unrecognized status is snapshotted verbatim
// rather than coerced or rejected: the engine's own rule is "anything other
// than verified is not verified", so an unrecognized value can never be
// silently read as verified, and refusing it here would make this module
// the gatekeeper over a governed vocabulary it has no business defining
// (the alternative ADR-CT-033 explicitly rejects).
func TestSubmitIngredient_UnknownSupplierStatusSnapshottedVerbatim(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Cetyl Alcohol", "e1", "1", `{"defaultHalalRisk":true}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", `{"verificationStatus":"pending_review"}`)

	record, err := contract.SubmitIngredient(ctx, batch.BatchID, "Cetyl Alcohol", "PT Sumber Alam Nusantara", false, false, "", "")
	if err != nil {
		t.Fatalf("expected SubmitIngredient to record the status as given, got: %v", err)
	}
	if record.SupplierVerificationStatus != "pending_review" {
		t.Fatalf("expected the status to be snapshotted verbatim, got %q", record.SupplierVerificationStatus)
	}
}

// Paired negative test for the snapshot above (Guardrails §2/§3): a
// supplier entry that answers no verification question cannot be the
// source of a compliance fact. The submission is refused with its own
// reason code -- the same fail-closed discipline as ADR-CT-030's
// storage_unavailable -- rather than recording an empty value that the
// verdict engine would have to re-derive from outside the digested record
// set, or that would silently read as unverified in a signed attestation.
func TestSubmitIngredient_MissingSupplierVerificationStatusRejected(t *testing.T) {
	cases := map[string]string{
		"no metadata at all":              "",
		"metadata about something else":   `{"note":"verified out of band, see file 12"}`,
		"verificationStatus set to empty": `{"verificationStatus":""}`,
	}

	for name, metadata := range cases {
		t.Run(name, func(t *testing.T) {
			ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
			contract := &BatchContract{}
			batch, err := contract.CreateBatch(ctx, "Malaysia")
			if err != nil {
				t.Fatalf("expected CreateBatch to succeed, got: %v", err)
			}
			stubResolveActiveReference(ctx.stub, "ingredient", "Cetyl Alcohol", "e1", "1", `{"defaultHalalRisk":true}`)
			stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", metadata)

			_, err = contract.SubmitIngredient(ctx, batch.BatchID, "Cetyl Alcohol", "PT Sumber Alam Nusantara", false, false, "", "")
			if err == nil {
				t.Fatal("expected SubmitIngredient to reject a supplier entry with no verificationStatus")
			}
			if !strings.Contains(err.Error(), "missing_reference_metadata") {
				t.Fatalf("expected a missing_reference_metadata rejection, got: %v", err)
			}

			// Fail closed means nothing was written: a rejected submission
			// must not leave a partially-populated record the verdict path
			// could later pick up.
			iterator, err := ctx.stub.GetStateByPartialCompositeKey("ingredientRecord", []string{batch.BatchID})
			if err != nil {
				t.Fatalf("failed to query ingredient records: %v", err)
			}
			defer iterator.Close()
			if iterator.HasNext() {
				t.Fatal("expected no ingredient record to have been written by the rejected submission")
			}
		})
	}
}

// Metadata that isn't a JSON object at all is a defect in the reference
// entry, and gets its own message rather than being folded into the
// missing-status case -- an operator reading the log needs to know which
// of the two they are looking at.
func TestSubmitIngredient_MalformedSupplierMetadataRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Cetyl Alcohol", "e1", "1", `{"defaultHalalRisk":true}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", `{"verificationStatus":`)

	_, err = contract.SubmitIngredient(ctx, batch.BatchID, "Cetyl Alcohol", "PT Sumber Alam Nusantara", false, false, "", "")
	if err == nil {
		t.Fatal("expected SubmitIngredient to reject malformed supplier metadata")
	}
	if !strings.Contains(err.Error(), "failed to unmarshal supplier metadata") {
		t.Fatalf("expected an unmarshal failure, got: %v", err)
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
	stubResolveActiveReference(ctx.stub, "supplier", "PT Kimia Hijau Indonesia", "e2", "1", verifiedSupplier)

	_, err = contract.SubmitIngredient(ctx, batch.BatchID, "Cetyl Alcohol", "PT Kimia Hijau Indonesia", true, false, "", "")
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
	stubResolveActiveReference(ctx.stub, "supplier", "PT Kimia Hijau Indonesia", "e2", "1", verifiedSupplier)

	record, err := contract.SubmitIngredient(
		ctx, batch.BatchID, "Cetyl Alcohol", "PT Kimia Hijau Indonesia",
		true, false, "Verified plant-derived source, documented on file", "",
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
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e3", "1", verifiedSupplier)

	ctx.stub.txID = "tx-1"
	first, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "", "")
	if err != nil {
		t.Fatalf("expected the first SubmitIngredient call to succeed, got: %v", err)
	}
	ctx.stub.txID = "tx-2"
	second, err := contract.SubmitIngredient(ctx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", "")
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

// batchWithIngredient sets up a batch that has already cleared
// FRD-CHAIN-SEQUENCE-001's prerequisite (a prior ingredient record) --
// shared setup for every ConfirmProduction test below.
func batchWithIngredient(t *testing.T) (*mockTransactionContext, *Batch) {
	t.Helper()
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Aqua", "e1", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", verifiedSupplier)
	if _, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "", ""); err != nil {
		t.Fatalf("expected SubmitIngredient to succeed, got: %v", err)
	}
	return ctx, batch
}

func TestConfirmProduction_ProductionQASucceeds(t *testing.T) {
	ctx, batch := batchWithIngredient(t)
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e3", "1", "")

	prodCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	record, err := contract.ConfirmProduction(prodCtx, batch.BatchID, true)
	if err != nil {
		t.Fatalf("expected ConfirmProduction to succeed for Production QA, got: %v", err)
	}
	if record.BatchID != batch.BatchID {
		t.Fatalf("expected BatchID %q, got %q", batch.BatchID, record.BatchID)
	}
	if !record.LineSegregationConfirmed {
		t.Fatal("expected LineSegregationConfirmed to be true")
	}
	if record.StandardSnapshot != "CPKB" || record.StandardReferenceEntryID != "e3" || record.StandardReferenceVersion != "1" {
		t.Fatalf("expected the standard snapshot to match the resolved reference, got: %+v", record)
	}
	if record.BatchDate == "" || record.Timestamp == "" || record.SubmittedBy == "" || record.RecordID == "" {
		t.Fatalf("expected BatchDate/Timestamp/SubmittedBy/RecordID to be populated, got: %+v", record)
	}
}

// FRD-CHAIN-ROLE-002: Production QA may submit production records only.
func TestConfirmProduction_OtherRolesRejected(t *testing.T) {
	ctx, batch := batchWithIngredient(t)
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e3", "1", "")

	roles := []string{"ingredient_qa", "compliance_officer", "export_officer", "brand_owner", "system_admin"}
	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			roleCtx := ctx.actingAs(t, "Org1MSP", role)
			contract := &BatchContract{}

			_, err := contract.ConfirmProduction(roleCtx, batch.BatchID, true)
			if err == nil {
				t.Fatalf("expected ConfirmProduction to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

func TestConfirmProduction_NonexistentBatchRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	_, err := contract.ConfirmProduction(ctx, "SL-2026-999", true)
	if err == nil {
		t.Fatal("expected ConfirmProduction to reject a batch ID that was never created")
	}
	if !strings.Contains(err.Error(), "batch_not_found") {
		t.Fatalf("expected a batch_not_found rejection, got: %v", err)
	}
}

// FRD-CHAIN-SEQUENCE-001: production requires a prior ingredient record.
func TestConfirmProduction_NoIngredientYetRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}

	prodCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	_, err = contract.ConfirmProduction(prodCtx, batch.BatchID, true)
	if err == nil {
		t.Fatal("expected ConfirmProduction to reject a batch with no ingredient record yet")
	}
	if !strings.Contains(err.Error(), "sequencing_violation") {
		t.Fatalf("expected a sequencing_violation rejection, got: %v", err)
	}
}

func TestConfirmProduction_SecondConfirmationRejected(t *testing.T) {
	ctx, batch := batchWithIngredient(t)
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e3", "1", "")
	prodCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	if _, err := contract.ConfirmProduction(prodCtx, batch.BatchID, true); err != nil {
		t.Fatalf("expected the first ConfirmProduction call to succeed, got: %v", err)
	}

	_, err := contract.ConfirmProduction(prodCtx, batch.BatchID, true)
	if err == nil {
		t.Fatal("expected a second plain production confirmation to be rejected")
	}
	if !strings.Contains(err.Error(), "duplicate_entry") {
		t.Fatalf("expected a duplicate_entry rejection, got: %v", err)
	}
}

func TestConfirmProduction_LineSegregationFalseRecorded(t *testing.T) {
	ctx, batch := batchWithIngredient(t)
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e3", "1", "")
	prodCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	record, err := contract.ConfirmProduction(prodCtx, batch.BatchID, false)
	if err != nil {
		t.Fatalf("expected ConfirmProduction to succeed even when line segregation is not confirmed, got: %v", err)
	}
	if record.LineSegregationConfirmed {
		t.Fatal("expected LineSegregationConfirmed to be recorded as false, not silently flipped")
	}
}

// batchWithProduction sets up a batch that has cleared both
// FRD-CHAIN-SEQUENCE-001 (ingredient exists) and FRD-CHAIN-SEQUENCE-002
// (production exists) -- shared setup for every RecordVerdict test below.
func batchWithProduction(t *testing.T) (*mockTransactionContext, *Batch) {
	t.Helper()
	ctx, batch := batchWithIngredient(t)
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e-cpkb", "1", "")
	prodCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}
	if _, err := contract.ConfirmProduction(prodCtx, batch.BatchID, true); err != nil {
		t.Fatalf("expected ConfirmProduction to succeed, got: %v", err)
	}
	return ctx, batch
}

// signedAttestation computes the real input digest against ctx's current
// ledger state (calling the same computeEffectiveInputDigest RecordVerdict
// itself uses), fills it into att, marshals, and signs with priv --
// producing exactly what a real backend would submit.
func signedAttestation(t *testing.T, ctx *mockTransactionContext, priv *ecdsa.PrivateKey, att VerdictAttestation) (string, string) {
	t.Helper()
	digest, err := computeEffectiveInputDigest(ctx, att.BatchID)
	if err != nil {
		t.Fatalf("failed to compute digest for test attestation: %v", err)
	}
	att.InputDigest = digest

	payload, err := json.Marshal(att)
	if err != nil {
		t.Fatalf("failed to marshal test attestation: %v", err)
	}

	hash := sha256.Sum256(payload)
	sig, err := ecdsa.SignASN1(rand.Reader, priv, hash[:])
	if err != nil {
		t.Fatalf("failed to sign test attestation: %v", err)
	}

	return string(payload), base64.StdEncoding.EncodeToString(sig)
}

func TestRecordVerdict_ComplianceOfficerSucceedsWithPass(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")

	att := VerdictAttestation{
		BatchID:         batch.BatchID,
		IntendedMarket:  string(batch.IntendedMarket),
		EngineVersion:   "0.1.0",
		RulesRelease:    "2026.07",
		Result:          "pass",
		RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	record, err := contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err != nil {
		t.Fatalf("expected RecordVerdict to succeed for Compliance Officer, got: %v", err)
	}
	if record.Status != "pass" {
		t.Fatalf("expected status pass, got %q", record.Status)
	}
	if record.RegulationSnapshot != "PP 42/2024" || record.RegulationReferenceEntryID != "e-reg" {
		t.Fatalf("expected the regulation snapshot to match the resolved reference, got: %+v", record)
	}
	if record.EngineVersion != "0.1.0" || record.RulesRelease != "2026.07" {
		t.Fatalf("expected engine_version/rules_release to be recorded from the attestation, got: %+v", record)
	}
	if record.FlaggedRecordID != "" || record.FailReasonSnapshot != "" {
		t.Fatalf("expected no fail fields on a pass verdict, got: %+v", record)
	}
}

// FRD-CHAIN-ROLE-003: Compliance Officer may submit verdict records only.
func TestRecordVerdict_OtherRolesRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass", RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	roles := []string{"ingredient_qa", "production_qa", "export_officer", "brand_owner", "system_admin"}
	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			roleCtx := ctx.actingAs(t, "Org1MSP", role)
			contract := &BatchContract{}

			_, err := contract.RecordVerdict(roleCtx, attJSON, sig)
			if err == nil {
				t.Fatalf("expected RecordVerdict to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

// The whole point of the attestation scheme: a tampered payload -- even a
// single field changed after signing -- must be rejected, not silently
// trusted because it still parses as valid JSON.
func TestRecordVerdict_TamperedAttestationRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass", RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	tampered := strings.Replace(attJSON, `"result":"pass"`, `"result":"fail"`, 1)
	if tampered == attJSON {
		t.Fatal("test setup error: tampering did not change the payload")
	}

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	_, err := contract.RecordVerdict(complianceCtx, tampered, sig)
	if err == nil {
		t.Fatal("expected RecordVerdict to reject a tampered attestation")
	}
	if !strings.Contains(err.Error(), "attestation_invalid") {
		t.Fatalf("expected an attestation_invalid rejection, got: %v", err)
	}
}

// Distinct from TestRecordVerdict_TamperedAttestationRejected: here the
// payload is untouched, but it was signed by a key other than the one this
// chaincode is configured to trust -- a different class of forgery.
func TestRecordVerdict_WrongSigningKeyRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	withTestAttestationKey(t) // sets the chaincode's expected (trusted) key
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")

	wrongKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate an unrelated signing key: %v", err)
	}

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass", RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, wrongKey, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	_, err = contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err == nil {
		t.Fatal("expected RecordVerdict to reject an attestation signed by the wrong key")
	}
	if !strings.Contains(err.Error(), "attestation_invalid") {
		t.Fatalf("expected an attestation_invalid rejection, got: %v", err)
	}
}

func TestRecordVerdict_NonexistentBatchRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "compliance_officer")
	priv := withTestAttestationKey(t)

	att := VerdictAttestation{
		BatchID: "SL-2026-999", IntendedMarket: "Malaysia",
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass", RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	contract := &BatchContract{}
	_, err := contract.RecordVerdict(ctx, attJSON, sig)
	if err == nil {
		t.Fatal("expected RecordVerdict to reject a batch ID that was never created")
	}
	if !strings.Contains(err.Error(), "batch_not_found") {
		t.Fatalf("expected a batch_not_found rejection, got: %v", err)
	}
}

// FRD-CHAIN-SEQUENCE-002: verdict requires a prior production record.
func TestRecordVerdict_NoProductionYetRejected(t *testing.T) {
	ctx, batch := batchWithIngredient(t)
	priv := withTestAttestationKey(t)

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass", RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	_, err := contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err == nil {
		t.Fatal("expected RecordVerdict to reject a batch with no production record yet")
	}
	if !strings.Contains(err.Error(), "sequencing_violation") {
		t.Fatalf("expected a sequencing_violation rejection, got: %v", err)
	}
}

func TestRecordVerdict_MismatchedMarketRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)

	att := VerdictAttestation{
		BatchID:         batch.BatchID,
		IntendedMarket:  "Indonesia", // batch is actually Malaysia
		EngineVersion:   "0.1.0",
		RulesRelease:    "2026.07",
		Result:          "pass",
		RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	_, err := contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err == nil {
		t.Fatal("expected RecordVerdict to reject an attestation whose market doesn't match the batch's")
	}
	if !strings.Contains(err.Error(), "attestation_invalid") {
		t.Fatalf("expected an attestation_invalid rejection, got: %v", err)
	}
}

// A stale attestation -- one computed before the batch's records changed
// -- must be rejected, not silently applied against the wrong inputs.
func TestRecordVerdict_StaleDigestRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass",
		RegulationValue: "PP 42/2024",
		InputDigest:     "0000000000000000000000000000000000000000000000000000000000000000", // deliberately wrong
	}
	payload, err := json.Marshal(att)
	if err != nil {
		t.Fatalf("failed to marshal test attestation: %v", err)
	}
	hash := sha256.Sum256(payload)
	sig, err := ecdsa.SignASN1(rand.Reader, priv, hash[:])
	if err != nil {
		t.Fatalf("failed to sign test attestation: %v", err)
	}

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	_, err = contract.RecordVerdict(complianceCtx, string(payload), base64.StdEncoding.EncodeToString(sig))
	if err == nil {
		t.Fatal("expected RecordVerdict to reject an attestation with a stale/wrong input digest")
	}
	if !strings.Contains(err.Error(), "attestation_invalid") {
		t.Fatalf("expected an attestation_invalid rejection, got: %v", err)
	}
}

func TestRecordVerdict_FailRequiresFailReasonAndFlaggedRecord(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "fail",
		RegulationValue: "PP 42/2024",
		// FailReason and FlaggedRecordID deliberately omitted.
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	_, err := contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err == nil {
		t.Fatal("expected RecordVerdict to reject a fail result missing fail_reason/flagged_record_id")
	}
	if !strings.Contains(err.Error(), "attestation_invalid") {
		t.Fatalf("expected an attestation_invalid rejection, got: %v", err)
	}
}

func TestRecordVerdict_FailWithUnknownFlaggedRecordRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")
	stubResolveActiveReference(ctx.stub, "fail_reason", "Unverified ingredient source", "e-fr", "1", "")

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "fail",
		RegulationValue: "PP 42/2024",
		FailReason:      "Unverified ingredient source",
		FlaggedRecordID: "not-a-real-record-id",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	_, err := contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err == nil {
		t.Fatal("expected RecordVerdict to reject a flagged_record_id that doesn't exist on this batch")
	}
	if !strings.Contains(err.Error(), "attestation_invalid") {
		t.Fatalf("expected an attestation_invalid rejection, got: %v", err)
	}
}

func TestRecordVerdict_FailRecordsFlaggedRecordAndReason(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")
	stubResolveActiveReference(ctx.stub, "fail_reason", "Unverified ingredient source", "e-fr", "1", "")

	// The one real ingredient record batchWithIngredient created (via
	// batchWithProduction -> batchWithIngredient) is the flagged record.
	iterator, err := ctx.stub.GetStateByPartialCompositeKey("ingredientRecord", []string{batch.BatchID})
	if err != nil {
		t.Fatalf("failed to look up the existing ingredient record: %v", err)
	}
	defer iterator.Close()
	if !iterator.HasNext() {
		t.Fatal("expected an existing ingredient record from batchWithProduction's setup")
	}
	kv, err := iterator.Next()
	if err != nil {
		t.Fatalf("failed to read the existing ingredient record: %v", err)
	}
	var existing IngredientRecord
	if err := json.Unmarshal(kv.Value, &existing); err != nil {
		t.Fatalf("failed to unmarshal the existing ingredient record: %v", err)
	}

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "fail",
		RegulationValue: "PP 42/2024",
		FailReason:      "Unverified ingredient source",
		FlaggedRecordID: existing.RecordID,
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	record, err := contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err != nil {
		t.Fatalf("expected RecordVerdict to succeed with a valid fail attestation, got: %v", err)
	}
	if record.Status != "fail" {
		t.Fatalf("expected status fail, got %q", record.Status)
	}
	if record.FlaggedRecordID != existing.RecordID {
		t.Fatalf("expected FlaggedRecordID %q, got %q", existing.RecordID, record.FlaggedRecordID)
	}
	if record.FailReasonSnapshot != "Unverified ingredient source" || record.FailReasonReferenceEntryID != "e-fr" {
		t.Fatalf("expected the fail reason snapshot to match the resolved reference, got: %+v", record)
	}
}

func TestRecordVerdict_RecognitionCheckPassedThrough(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass",
		RegulationValue: "PP 42/2024",
		RecognitionCheck: &RecognitionCheck{
			IssuingBody: "JAKIM", RequiringBody: "BPJPH", Recognized: false, AsOfDate: "2025-01-01",
		},
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}

	record, err := contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err != nil {
		t.Fatalf("expected RecordVerdict to succeed, got: %v", err)
	}
	if record.RecognitionCheck == nil || record.RecognitionCheck.IssuingBody != "JAKIM" || record.RecognitionCheck.Recognized {
		t.Fatalf("expected the recognition check to be passed through unchanged, got: %+v", record.RecognitionCheck)
	}
}

// batchWithPassVerdict sets up a batch that has cleared every prerequisite
// through a recorded Pass verdict -- shared setup for every RequestExport
// test below.
func batchWithPassVerdict(t *testing.T) (*mockTransactionContext, *Batch, *ecdsa.PrivateKey) {
	t.Helper()
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass", RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	complianceContract := &BatchContract{}
	if _, err := complianceContract.RecordVerdict(complianceCtx, attJSON, sig); err != nil {
		t.Fatalf("expected RecordVerdict to succeed, got: %v", err)
	}

	return ctx, batch, priv
}

func TestRequestExport_ExportOfficerSucceeds(t *testing.T) {
	ctx, batch, _ := batchWithPassVerdict(t)
	exportCtx := ctx.actingAs(t, "Org1MSP", "export_officer")
	contract := &BatchContract{}

	record, err := contract.RequestExport(exportCtx, batch.BatchID)
	if err != nil {
		t.Fatalf("expected RequestExport to succeed for Export Officer, got: %v", err)
	}
	if record.BatchID != batch.BatchID {
		t.Fatalf("expected BatchID %q, got %q", batch.BatchID, record.BatchID)
	}
	if record.DestinationMarket != string(batch.IntendedMarket) {
		t.Fatalf("expected DestinationMarket to be copied from the batch's intended market %q, got %q", batch.IntendedMarket, record.DestinationMarket)
	}
	if record.RecordID == "" || record.Timestamp == "" || record.SubmittedBy == "" {
		t.Fatalf("expected RecordID/Timestamp/SubmittedBy to be populated, got: %+v", record)
	}
}

// FRD-CHAIN-ROLE-004: Export/Logistics Officer may submit export requests only.
func TestRequestExport_OtherRolesRejected(t *testing.T) {
	ctx, batch, _ := batchWithPassVerdict(t)

	roles := []string{"ingredient_qa", "production_qa", "compliance_officer", "brand_owner", "system_admin"}
	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			roleCtx := ctx.actingAs(t, "Org1MSP", role)
			contract := &BatchContract{}

			_, err := contract.RequestExport(roleCtx, batch.BatchID)
			if err == nil {
				t.Fatalf("expected RequestExport to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

func TestRequestExport_NonexistentBatchRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "export_officer")
	contract := &BatchContract{}

	_, err := contract.RequestExport(ctx, "SL-2026-999")
	if err == nil {
		t.Fatal("expected RequestExport to reject a batch ID that was never created")
	}
	if !strings.Contains(err.Error(), "batch_not_found") {
		t.Fatalf("expected a batch_not_found rejection, got: %v", err)
	}
}

// FRD-CHAIN-SEQUENCE-003 / PRD-CT-004: export requires a recorded Pass
// verdict, technically blocked, not just visually disabled.
func TestRequestExport_NoVerdictYetRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	exportCtx := ctx.actingAs(t, "Org1MSP", "export_officer")
	contract := &BatchContract{}

	_, err := contract.RequestExport(exportCtx, batch.BatchID)
	if err == nil {
		t.Fatal("expected RequestExport to reject a batch with no recorded verdict")
	}
	if !strings.Contains(err.Error(), "no_valid_verdict") {
		t.Fatalf("expected a no_valid_verdict rejection, got: %v", err)
	}
}

func TestRequestExport_FailVerdictRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")
	stubResolveActiveReference(ctx.stub, "fail_reason", "Unverified ingredient source", "e-fr", "1", "")

	iterator, err := ctx.stub.GetStateByPartialCompositeKey("ingredientRecord", []string{batch.BatchID})
	if err != nil {
		t.Fatalf("failed to look up the existing ingredient record: %v", err)
	}
	defer iterator.Close()
	kv, err := iterator.Next()
	if err != nil {
		t.Fatalf("failed to read the existing ingredient record: %v", err)
	}
	var existing IngredientRecord
	if err := json.Unmarshal(kv.Value, &existing); err != nil {
		t.Fatalf("failed to unmarshal the existing ingredient record: %v", err)
	}

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "fail",
		RegulationValue: "PP 42/2024",
		FailReason:      "Unverified ingredient source",
		FlaggedRecordID: existing.RecordID,
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	complianceContract := &BatchContract{}
	if _, err := complianceContract.RecordVerdict(complianceCtx, attJSON, sig); err != nil {
		t.Fatalf("expected RecordVerdict to succeed, got: %v", err)
	}

	exportCtx := ctx.actingAs(t, "Org1MSP", "export_officer")
	exportContract := &BatchContract{}
	_, err = exportContract.RequestExport(exportCtx, batch.BatchID)
	if err == nil {
		t.Fatal("expected RequestExport to reject a batch whose current verdict is Fail")
	}
	if !strings.Contains(err.Error(), "no_valid_verdict") {
		t.Fatalf("expected a no_valid_verdict rejection, got: %v", err)
	}
}

func TestRequestExport_SecondExportRejected(t *testing.T) {
	ctx, batch, _ := batchWithPassVerdict(t)
	exportCtx := ctx.actingAs(t, "Org1MSP", "export_officer")
	contract := &BatchContract{}

	if _, err := contract.RequestExport(exportCtx, batch.BatchID); err != nil {
		t.Fatalf("expected the first RequestExport call to succeed, got: %v", err)
	}

	_, err := contract.RequestExport(exportCtx, batch.BatchID)
	if err == nil {
		t.Fatal("expected a second export request for the same batch to be rejected")
	}
	if !strings.Contains(err.Error(), "duplicate_entry") {
		t.Fatalf("expected a duplicate_entry rejection, got: %v", err)
	}
}

// The core proof of the "latest, not just any" semantics: a Fail recorded
// AFTER an earlier Pass must block export again, even though a Pass exists
// somewhere in this batch's history.
func TestRequestExport_LatestVerdictGovernsNotAnyPass(t *testing.T) {
	ctx, batch, priv := batchWithPassVerdict(t)

	// A second, later verdict flips this batch to Fail.
	stubResolveActiveReference(ctx.stub, "fail_reason", "Missing Certificate of Analysis", "e-fr2", "1", "")
	iterator, err := ctx.stub.GetStateByPartialCompositeKey("ingredientRecord", []string{batch.BatchID})
	if err != nil {
		t.Fatalf("failed to look up the existing ingredient record: %v", err)
	}
	defer iterator.Close()
	kv, err := iterator.Next()
	if err != nil {
		t.Fatalf("failed to read the existing ingredient record: %v", err)
	}
	var existing IngredientRecord
	if err := json.Unmarshal(kv.Value, &existing); err != nil {
		t.Fatalf("failed to unmarshal the existing ingredient record: %v", err)
	}

	ctx.stub.txID = "tx-second-verdict"
	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "fail",
		RegulationValue: "PP 42/2024",
		FailReason:      "Missing Certificate of Analysis",
		FlaggedRecordID: existing.RecordID,
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	complianceContract := &BatchContract{}
	if _, err := complianceContract.RecordVerdict(complianceCtx, attJSON, sig); err != nil {
		t.Fatalf("expected the second RecordVerdict call to succeed, got: %v", err)
	}

	exportCtx := ctx.actingAs(t, "Org1MSP", "export_officer")
	exportContract := &BatchContract{}
	_, err = exportContract.RequestExport(exportCtx, batch.BatchID)
	if err == nil {
		t.Fatal("expected RequestExport to be blocked once the LATEST verdict is Fail, even though an earlier Pass exists")
	}
	if !strings.Contains(err.Error(), "no_valid_verdict") {
		t.Fatalf("expected a no_valid_verdict rejection, got: %v", err)
	}
}

// batchWithFailVerdict sets up a batch that has cleared every prerequisite
// through a recorded Fail verdict flagging the single record of type
// flaggedObjectType ("ingredientRecord" or "productionRecord") -- shared
// setup for CorrectIngredient/CorrectProduction tests, mirroring how
// batchWithPassVerdict sets up the pass case for RequestExport.
//
// Deliberately not built on batchWithIngredient/batchWithProduction: those
// leave both records sharing the mock's default "test-tx-id" (harmless
// there, since GetTxID() is genuinely unique per transaction on a real
// network and nothing in those tests keys off record type by ID). Here it
// would matter -- the "wrong record type flagged" tests below need the
// ingredient and production records to have genuinely distinct RecordIDs,
// so this fixture assigns them explicitly.
func batchWithFailVerdict(t *testing.T, flaggedObjectType string) (*mockTransactionContext, *Batch, string) {
	t.Helper()
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Aqua", "e1", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", verifiedSupplier)
	ctx.stub.txID = "tx-ingredient"
	if _, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "", ""); err != nil {
		t.Fatalf("expected SubmitIngredient to succeed, got: %v", err)
	}

	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e-cpkb", "1", "")
	prodCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	prodCtx.stub.txID = "tx-production"
	if _, err := contract.ConfirmProduction(prodCtx, batch.BatchID, true); err != nil {
		t.Fatalf("expected ConfirmProduction to succeed, got: %v", err)
	}

	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")
	stubResolveActiveReference(ctx.stub, "fail_reason", "Unverified ingredient source", "e-fr", "1", "")

	iterator, err := ctx.stub.GetStateByPartialCompositeKey(flaggedObjectType, []string{batch.BatchID})
	if err != nil {
		t.Fatalf("failed to look up the existing %s record: %v", flaggedObjectType, err)
	}
	defer iterator.Close()
	if !iterator.HasNext() {
		t.Fatalf("expected an existing %s record from batchWithProduction's setup", flaggedObjectType)
	}
	kv, err := iterator.Next()
	if err != nil {
		t.Fatalf("failed to read the existing %s record: %v", flaggedObjectType, err)
	}
	var withRecordID struct {
		RecordID string `json:"record_id"`
	}
	if err := json.Unmarshal(kv.Value, &withRecordID); err != nil {
		t.Fatalf("failed to unmarshal the existing %s record: %v", flaggedObjectType, err)
	}

	ctx.stub.txID = "tx-fail-verdict"
	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "fail",
		RegulationValue: "PP 42/2024",
		FailReason:      "Unverified ingredient source",
		FlaggedRecordID: withRecordID.RecordID,
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	complianceContract := &BatchContract{}
	if _, err := complianceContract.RecordVerdict(complianceCtx, attJSON, sig); err != nil {
		t.Fatalf("expected RecordVerdict to succeed with a fail attestation, got: %v", err)
	}

	return ctx, batch, withRecordID.RecordID
}

func TestCorrectIngredient_IngredientQASucceeds(t *testing.T) {
	ctx, batch, flaggedRecordID := batchWithFailVerdict(t, "ingredientRecord")
	stubResolveActiveReference(ctx.stub, "ingredient", "Glycerin", "e-glycerin", "1", `{"defaultHalalRisk":false}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Distribusi Kosmetik Prima", "e-supplier2", "1", unverifiedSupplier)
	correctionCtx := ctx.actingAs(t, "Org1MSP", "ingredient_qa")
	correctionCtx.stub.txID = "correction-tx-1"
	contract := &BatchContract{}

	record, err := contract.CorrectIngredient(correctionCtx, batch.BatchID, "Glycerin", "PT Distribusi Kosmetik Prima", false, false, "", "")
	if err != nil {
		t.Fatalf("expected CorrectIngredient to succeed, got: %v", err)
	}
	if record.SupersedesRecordID != flaggedRecordID {
		t.Fatalf("expected SupersedesRecordID %q, got %q", flaggedRecordID, record.SupersedesRecordID)
	}
	if record.RecordID == flaggedRecordID {
		t.Fatal("expected the correction to get a new RecordID, not overwrite the flagged one")
	}
	if record.IngredientNameSnapshot != "Glycerin" {
		t.Fatalf("expected the correction to record the new ingredient value, got %q", record.IngredientNameSnapshot)
	}
}

// FRD-CHAIN-ROLE-001: only Ingredient QA -- the owner role -- may submit a
// correction, matching who may submit the original record.
func TestCorrectIngredient_OtherRolesRejected(t *testing.T) {
	ctx, batch, _ := batchWithFailVerdict(t, "ingredientRecord")
	stubResolveActiveReference(ctx.stub, "ingredient", "Glycerin", "e-glycerin", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e-supplier", "1", verifiedSupplier)

	roles := []string{"production_qa", "compliance_officer", "export_officer", "brand_owner", "system_admin"}
	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			roleCtx := ctx.actingAs(t, "Org1MSP", role)
			contract := &BatchContract{}

			_, err := contract.CorrectIngredient(roleCtx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", "")
			if err == nil {
				t.Fatalf("expected CorrectIngredient to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

func TestCorrectIngredient_NonexistentBatchRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	_, err := contract.CorrectIngredient(ctx, "SL-2026-999", "Glycerin", "PT Sumber Alam Nusantara", false, false, "", "")
	if err == nil {
		t.Fatal("expected CorrectIngredient to reject a batch ID that was never created")
	}
	if !strings.Contains(err.Error(), "batch_not_found") {
		t.Fatalf("expected a batch_not_found rejection, got: %v", err)
	}
}

// A batch with no recorded verdict at all has nothing to correct.
func TestCorrectIngredient_NoVerdictYetRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	contract := &BatchContract{}

	_, err := contract.CorrectIngredient(ctx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", "")
	if err == nil {
		t.Fatal("expected CorrectIngredient to reject a batch with no recorded verdict")
	}
	if !strings.Contains(err.Error(), "sequencing_violation") {
		t.Fatalf("expected a sequencing_violation rejection, got: %v", err)
	}
}

// TRD §23.5: correction is only valid "while the latest effective verdict
// is Fail" -- a Pass verdict means there's nothing to correct.
func TestCorrectIngredient_PassVerdictRejected(t *testing.T) {
	ctx, batch, _ := batchWithPassVerdict(t)
	correctionCtx := ctx.actingAs(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	_, err := contract.CorrectIngredient(correctionCtx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", "")
	if err == nil {
		t.Fatal("expected CorrectIngredient to reject a batch whose current verdict is pass")
	}
	if !strings.Contains(err.Error(), "sequencing_violation") {
		t.Fatalf("expected a sequencing_violation rejection, got: %v", err)
	}
}

// The current Fail verdict flagged the PRODUCTION record, not an
// ingredient record -- CorrectIngredient must refuse to touch the wrong
// record type rather than silently correcting something unrelated.
func TestCorrectIngredient_ProductionFlaggedRejected(t *testing.T) {
	ctx, batch, _ := batchWithFailVerdict(t, "productionRecord")
	correctionCtx := ctx.actingAs(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	_, err := contract.CorrectIngredient(correctionCtx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", "")
	if err == nil {
		t.Fatal("expected CorrectIngredient to reject when the current Fail verdict flagged a production record instead")
	}
	if !strings.Contains(err.Error(), "sequencing_violation") {
		t.Fatalf("expected a sequencing_violation rejection, got: %v", err)
	}
}

// Only one correction is ever valid per flagged record (TRD §23.5) -- a
// second attempt against the same still-Fail verdict must be rejected as a
// duplicate, not silently accepted as a second competing correction.
func TestCorrectIngredient_SecondCorrectionRejected(t *testing.T) {
	ctx, batch, _ := batchWithFailVerdict(t, "ingredientRecord")
	stubResolveActiveReference(ctx.stub, "ingredient", "Glycerin", "e-glycerin", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e-supplier", "1", verifiedSupplier)
	correctionCtx := ctx.actingAs(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	correctionCtx.stub.txID = "correction-tx-1"
	if _, err := contract.CorrectIngredient(correctionCtx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", ""); err != nil {
		t.Fatalf("expected the first CorrectIngredient call to succeed, got: %v", err)
	}

	correctionCtx.stub.txID = "correction-tx-2"
	_, err := contract.CorrectIngredient(correctionCtx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", "")
	if err == nil {
		t.Fatal("expected a second CorrectIngredient call against the same flagged record to be rejected")
	}
	if !strings.Contains(err.Error(), "duplicate_entry") {
		t.Fatalf("expected a duplicate_entry rejection, got: %v", err)
	}
}

// ADR-CT-033 calls out the shared writer specifically so the correction
// path cannot drift from the submission path: a correction that moved a
// batch off the supplier that failed it would otherwise leave the
// replacement record without the very fact the engine re-evaluates.
// This is also the live recovery arc's shape -- correct away from an
// unverified supplier -- so both branches are asserted here.
func TestCorrectIngredient_SnapshotsSupplierVerificationStatus(t *testing.T) {
	ctx, batch, flaggedRecordID := batchWithFailVerdict(t, "ingredientRecord")
	stubResolveActiveReference(ctx.stub, "ingredient", "Glycerin", "e-glycerin", "1", `{"defaultHalalRisk":true}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Distribusi Kosmetik Prima", "e-supplier2", "1", unverifiedSupplier)
	correctionCtx := ctx.actingAs(t, "Org1MSP", "ingredient_qa")
	correctionCtx.stub.txID = "correction-tx-1"
	contract := &BatchContract{}

	record, err := contract.CorrectIngredient(correctionCtx, batch.BatchID, "Glycerin", "PT Distribusi Kosmetik Prima", false, false, "", "")
	if err != nil {
		t.Fatalf("expected CorrectIngredient to succeed, got: %v", err)
	}
	if record.SupersedesRecordID != flaggedRecordID {
		t.Fatalf("expected SupersedesRecordID %q, got %q", flaggedRecordID, record.SupersedesRecordID)
	}
	if record.SupplierVerificationStatus != "unverified" {
		t.Fatalf("expected the correction to snapshot the supplier's verification status, got %q", record.SupplierVerificationStatus)
	}
}

// The correction path enforces the same precondition as the plain
// submission path -- the shared writer is one contract, not two.
func TestCorrectIngredient_MissingSupplierVerificationStatusRejected(t *testing.T) {
	ctx, batch, _ := batchWithFailVerdict(t, "ingredientRecord")
	stubResolveActiveReference(ctx.stub, "ingredient", "Glycerin", "e-glycerin", "1", `{"defaultHalalRisk":true}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Distribusi Kosmetik Prima", "e-supplier2", "1", "")
	correctionCtx := ctx.actingAs(t, "Org1MSP", "ingredient_qa")
	correctionCtx.stub.txID = "correction-tx-1"
	contract := &BatchContract{}

	_, err := contract.CorrectIngredient(correctionCtx, batch.BatchID, "Glycerin", "PT Distribusi Kosmetik Prima", false, false, "", "")
	if err == nil {
		t.Fatal("expected CorrectIngredient to reject a supplier entry with no verificationStatus")
	}
	if !strings.Contains(err.Error(), "missing_reference_metadata") {
		t.Fatalf("expected a missing_reference_metadata rejection, got: %v", err)
	}
}

// The original flagged record must remain queryable and untouched by its
// own correction (FRD-CHAIN-LEDGER-003), not overwritten in place.
func TestCorrectIngredient_OriginalRecordUntouched(t *testing.T) {
	ctx, batch, flaggedRecordID := batchWithFailVerdict(t, "ingredientRecord")
	originalKey, err := ingredientRecordKey(ctx, batch.BatchID, flaggedRecordID)
	if err != nil {
		t.Fatalf("failed to build the original ingredient record key: %v", err)
	}
	before := append([]byte(nil), ctx.stub.state[originalKey]...)

	stubResolveActiveReference(ctx.stub, "ingredient", "Glycerin", "e-glycerin", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e-supplier", "1", verifiedSupplier)
	correctionCtx := ctx.actingAs(t, "Org1MSP", "ingredient_qa")
	correctionCtx.stub.txID = "correction-tx-1"
	contract := &BatchContract{}
	if _, err := contract.CorrectIngredient(correctionCtx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", ""); err != nil {
		t.Fatalf("expected CorrectIngredient to succeed, got: %v", err)
	}

	after := ctx.stub.state[originalKey]
	if string(before) != string(after) {
		t.Fatalf("expected the original flagged record to remain byte-for-byte unchanged, before=%s after=%s", before, after)
	}
}

func TestCorrectProduction_ProductionQASucceeds(t *testing.T) {
	ctx, batch, flaggedRecordID := batchWithFailVerdict(t, "productionRecord")
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e-cpkb2", "1", "")
	correctionCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	correctionCtx.stub.txID = "correction-tx-1"
	contract := &BatchContract{}

	record, err := contract.CorrectProduction(correctionCtx, batch.BatchID, true)
	if err != nil {
		t.Fatalf("expected CorrectProduction to succeed, got: %v", err)
	}
	if record.SupersedesRecordID != flaggedRecordID {
		t.Fatalf("expected SupersedesRecordID %q, got %q", flaggedRecordID, record.SupersedesRecordID)
	}
	if record.RecordID == flaggedRecordID {
		t.Fatal("expected the correction to get a new RecordID, not overwrite the flagged one")
	}
}

// FRD-CHAIN-ROLE-002: only Production QA -- the owner role -- may submit a
// correction, matching who may submit the original record.
func TestCorrectProduction_OtherRolesRejected(t *testing.T) {
	ctx, batch, _ := batchWithFailVerdict(t, "productionRecord")
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e-cpkb2", "1", "")

	roles := []string{"ingredient_qa", "compliance_officer", "export_officer", "brand_owner", "system_admin"}
	for _, role := range roles {
		t.Run(role, func(t *testing.T) {
			roleCtx := ctx.actingAs(t, "Org1MSP", role)
			contract := &BatchContract{}

			_, err := contract.CorrectProduction(roleCtx, batch.BatchID, true)
			if err == nil {
				t.Fatalf("expected CorrectProduction to reject role %q, but it succeeded", role)
			}
			if !strings.Contains(err.Error(), "role_scope_violation") {
				t.Fatalf("expected a role_scope_violation rejection, got: %v", err)
			}
		})
	}
}

func TestCorrectProduction_NonexistentBatchRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	_, err := contract.CorrectProduction(ctx, "SL-2026-999", true)
	if err == nil {
		t.Fatal("expected CorrectProduction to reject a batch ID that was never created")
	}
	if !strings.Contains(err.Error(), "batch_not_found") {
		t.Fatalf("expected a batch_not_found rejection, got: %v", err)
	}
}

func TestCorrectProduction_NoVerdictYetRejected(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	correctionCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	_, err := contract.CorrectProduction(correctionCtx, batch.BatchID, true)
	if err == nil {
		t.Fatal("expected CorrectProduction to reject a batch with no recorded verdict")
	}
	if !strings.Contains(err.Error(), "sequencing_violation") {
		t.Fatalf("expected a sequencing_violation rejection, got: %v", err)
	}
}

// TRD §23.5/§23.6: correction is only valid "while the latest effective
// verdict is Fail" -- distinct from TestCorrectProduction_NoVerdictYetRejected
// (no verdict at all), this is TRD §23.6's "premature correction attempt"
// case for the Production QA path specifically: a verdict exists, but it's
// Pass, so there's nothing to correct.
func TestCorrectProduction_PassVerdictRejected(t *testing.T) {
	ctx, batch, _ := batchWithPassVerdict(t)
	correctionCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	_, err := contract.CorrectProduction(correctionCtx, batch.BatchID, true)
	if err == nil {
		t.Fatal("expected CorrectProduction to reject a batch whose current verdict is pass")
	}
	if !strings.Contains(err.Error(), "sequencing_violation") {
		t.Fatalf("expected a sequencing_violation rejection, got: %v", err)
	}
}

// The current Fail verdict flagged the INGREDIENT record, not the
// production record -- CorrectProduction must refuse to touch the wrong
// record type rather than silently correcting something unrelated.
func TestCorrectProduction_IngredientFlaggedRejected(t *testing.T) {
	ctx, batch, _ := batchWithFailVerdict(t, "ingredientRecord")
	correctionCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	_, err := contract.CorrectProduction(correctionCtx, batch.BatchID, true)
	if err == nil {
		t.Fatal("expected CorrectProduction to reject when the current Fail verdict flagged an ingredient record instead")
	}
	if !strings.Contains(err.Error(), "sequencing_violation") {
		t.Fatalf("expected a sequencing_violation rejection, got: %v", err)
	}
}

// Only one correction is ever valid per flagged record (TRD §23.5).
func TestCorrectProduction_SecondCorrectionRejected(t *testing.T) {
	ctx, batch, _ := batchWithFailVerdict(t, "productionRecord")
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e-cpkb2", "1", "")
	correctionCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}

	correctionCtx.stub.txID = "correction-tx-1"
	if _, err := contract.CorrectProduction(correctionCtx, batch.BatchID, true); err != nil {
		t.Fatalf("expected the first CorrectProduction call to succeed, got: %v", err)
	}

	correctionCtx.stub.txID = "correction-tx-2"
	_, err := contract.CorrectProduction(correctionCtx, batch.BatchID, true)
	if err == nil {
		t.Fatal("expected a second CorrectProduction call against the same flagged record to be rejected")
	}
	if !strings.Contains(err.Error(), "duplicate_entry") {
		t.Fatalf("expected a duplicate_entry rejection, got: %v", err)
	}
}

// ADR-CT-034: the integrity read must hand out exactly what the digest was
// computed over. This recomputes the digest from the returned bytes -- the
// same thing an external verifier does -- instead of trusting the returned
// field, so a change to hashing or ordering fails here rather than silently
// producing an unverifiable batch.
func TestGetBatchIntegrity_RecomputesToTheBatchsOwnDigest(t *testing.T) {
	ctx, batch := batchWithProduction(t)

	// A second ingredient, so "ingredients in key order, then production
	// records" is genuinely exercised instead of trivially satisfied.
	stubResolveActiveReference(ctx.stub, "ingredient", "Glycerin", "e-glycerin", "1", `{"defaultHalalRisk":false}`)
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e-supplier", "1", verifiedSupplier)
	ctx.stub.txID = "tx-second-ingredient"
	contract := &BatchContract{}
	if _, err := contract.SubmitIngredient(ctx, batch.BatchID, "Glycerin", "PT Sumber Alam Nusantara", false, false, "", ""); err != nil {
		t.Fatalf("expected the second SubmitIngredient to succeed, got: %v", err)
	}

	integrity, err := contract.GetBatchIntegrity(ctx, batch.BatchID)
	if err != nil {
		t.Fatalf("expected GetBatchIntegrity to succeed, got: %v", err)
	}
	if integrity.Algorithm != "sha256" {
		t.Fatalf("expected the algorithm to be stated as sha256, got %q", integrity.Algorithm)
	}
	if len(integrity.Records) != 3 {
		t.Fatalf("expected 3 records (2 ingredients + 1 production), got %d", len(integrity.Records))
	}
	if integrity.Records[0].ObjectType != "ingredientRecord" || integrity.Records[2].ObjectType != "productionRecord" {
		t.Fatalf(
			"expected ingredient records first and production records last, got %q ... %q",
			integrity.Records[0].ObjectType, integrity.Records[2].ObjectType,
		)
	}

	h := sha256.New()
	for _, record := range integrity.Records {
		raw, err := base64.StdEncoding.DecodeString(record.StoredBytesB64)
		if err != nil {
			t.Fatalf("failed to decode the stored bytes for %s: %v", record.RecordID, err)
		}
		own := sha256.Sum256(raw)
		if record.Sha256 != hex.EncodeToString(own[:]) {
			t.Fatalf("record %s: claimed sha256 %q does not match its own bytes", record.RecordID, record.Sha256)
		}
		h.Write(raw)
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != integrity.EffectiveInputDigest {
		t.Fatalf("recomputing the digest from the returned bytes gives %q, but the batch claims %q", got, integrity.EffectiveInputDigest)
	}
}

func TestGetBatchIntegrity_UnknownBatchRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "brand_owner")
	contract := &BatchContract{}

	_, err := contract.GetBatchIntegrity(ctx, "SL-2026-999")
	if err == nil {
		t.Fatal("expected GetBatchIntegrity to reject a batch that was never created")
	}
	if !strings.Contains(err.Error(), "batch_not_found") {
		t.Fatalf("expected a batch_not_found rejection, got: %v", err)
	}
}

// The bytes returned must be the ledger's own, not a re-serialization of a
// decoded struct: a future field this version doesn't know about would be
// dropped by a round-trip, which changes the hash of a record that was never
// touched -- a verifier would then see a mismatch and blame the ledger.
func TestGetBatchIntegrity_ReturnsRawStoredBytesNotAReserialization(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	planted := `{"record_id":"future-shape-record","batch_id":"` + batch.BatchID +
		`","ingredient_name_snapshot":"Aqua","source_snapshot":"PT Sumber Alam Nusantara",` +
		`"halal_risk_flag":false,"future_field":"must survive","timestamp":"2026-01-01T00:00:00Z","submitted_by":"x"}`
	key, err := ingredientRecordKey(ctx, batch.BatchID, "future-shape-record")
	if err != nil {
		t.Fatalf("failed to build the planted record key: %v", err)
	}
	ctx.stub.state[key] = []byte(planted)

	contract := &BatchContract{}
	integrity, err := contract.GetBatchIntegrity(ctx, batch.BatchID)
	if err != nil {
		t.Fatalf("expected GetBatchIntegrity to succeed, got: %v", err)
	}

	found := false
	h := sha256.New()
	for _, record := range integrity.Records {
		raw, err := base64.StdEncoding.DecodeString(record.StoredBytesB64)
		if err != nil {
			t.Fatalf("failed to decode the stored bytes for %s: %v", record.RecordID, err)
		}
		h.Write(raw)
		if record.RecordID == "future-shape-record" {
			found = true
			if !strings.Contains(string(raw), "future_field") {
				t.Fatalf("expected the record's stored bytes verbatim, got: %s", raw)
			}
		}
	}
	if !found {
		t.Fatal("expected the planted record to appear in the integrity response")
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != integrity.EffectiveInputDigest {
		t.Fatalf("recomputing the digest with the planted record gives %q, but the batch claims %q", got, integrity.EffectiveInputDigest)
	}
}

// ADR-CT-034: the attestation and its signature are stored, not discarded
// after verification -- otherwise nobody, including this project, can check
// later who attested to what.
func TestRecordVerdict_StoresTheAttestationAndItsSignature(t *testing.T) {
	ctx, batch := batchWithProduction(t)
	priv := withTestAttestationKey(t)
	stubResolveActiveReference(ctx.stub, "standard", "PP 42/2024", "e-reg", "1", "")

	att := VerdictAttestation{
		BatchID: batch.BatchID, IntendedMarket: string(batch.IntendedMarket),
		EngineVersion: "0.1.0", RulesRelease: "2026.07", Result: "pass", RegulationValue: "PP 42/2024",
	}
	attJSON, sig := signedAttestation(t, ctx, priv, att)

	complianceCtx := ctx.actingAs(t, "Org1MSP", "compliance_officer")
	contract := &BatchContract{}
	record, err := contract.RecordVerdict(complianceCtx, attJSON, sig)
	if err != nil {
		t.Fatalf("expected RecordVerdict to succeed, got: %v", err)
	}
	if record.EngineAttestation != attJSON {
		t.Fatalf("expected the signed payload stored verbatim, got %q", record.EngineAttestation)
	}
	if record.EngineAttestationSignature != sig {
		t.Fatalf("expected the signature stored verbatim, got %q", record.EngineAttestationSignature)
	}
	if err := verifyAttestationSignature([]byte(record.EngineAttestation), record.EngineAttestationSignature); err != nil {
		t.Fatalf("expected the stored attestation to still verify against its stored signature, got: %v", err)
	}
	digest, err := computeEffectiveInputDigest(ctx, batch.BatchID)
	if err != nil {
		t.Fatalf("failed to recompute the batch digest: %v", err)
	}
	if record.EngineAttestationDigest != digest {
		t.Fatalf("expected the recorded digest %q to be the batch's own %q", record.EngineAttestationDigest, digest)
	}
}

// The published key must be the key signatures are actually verified against
// -- a verifier that trusts this endpoint would otherwise be checking
// signatures with the wrong half of a rotation.
func TestGetAttestationPublicKey_PublishesTheKeyActuallyUsed(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "brand_owner")
	contract := &BatchContract{}

	pemText, err := contract.GetAttestationPublicKey(ctx)
	if err != nil {
		t.Fatalf("expected GetAttestationPublicKey to succeed, got: %v", err)
	}
	block, _ := pem.Decode([]byte(pemText))
	if block == nil {
		t.Fatalf("expected a PEM-encoded public key, got: %q", pemText)
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		t.Fatalf("failed to parse the published public key: %v", err)
	}
	published, ok := parsed.(*ecdsa.PublicKey)
	if !ok {
		t.Fatal("expected the published key to be an ECDSA public key")
	}
	if published.X.Cmp(verdictAttestationPublicKey.X) != 0 || published.Y.Cmp(verdictAttestationPublicKey.Y) != 0 {
		t.Fatal("the published key is not the key this module verifies attestation signatures against")
	}
}

func TestGetBatchTrail_FreshBatchHasEmptySlicesNotNull(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}

	trail, err := contract.GetBatchTrail(ctx, batch.BatchID)
	if err != nil {
		t.Fatalf("expected GetBatchTrail to succeed, got: %v", err)
	}
	if trail.Batch.BatchID != batch.BatchID {
		t.Fatalf("expected Batch.BatchID %q, got %q", batch.BatchID, trail.Batch.BatchID)
	}
	if trail.IngredientRecords == nil || trail.ProductionRecords == nil || trail.VerdictRecords == nil || trail.ExportRecords == nil {
		t.Fatal("expected every record slice to be [], not nil -- a nil slice marshals as JSON null, which would trip contractapi schema validation the same way the P2 metadata-tag incident did")
	}
	if len(trail.IngredientRecords) != 0 || len(trail.ProductionRecords) != 0 {
		t.Fatalf("expected no records yet, got: %+v", trail)
	}
	if trail.EffectiveInputDigest == "" {
		t.Fatal("expected EffectiveInputDigest to always be populated, even for a batch with no records")
	}
}

func TestGetBatchTrail_ReturnsSubmittedRecordsAndMatchingDigest(t *testing.T) {
	ctx, batch := batchWithIngredient(t)
	stubResolveActiveReference(ctx.stub, "standard", "CPKB", "e3", "1", "")
	prodCtx := ctx.actingAs(t, "Org1MSP", "production_qa")
	contract := &BatchContract{}
	if _, err := contract.ConfirmProduction(prodCtx, batch.BatchID, true); err != nil {
		t.Fatalf("expected ConfirmProduction to succeed, got: %v", err)
	}

	trail, err := contract.GetBatchTrail(ctx, batch.BatchID)
	if err != nil {
		t.Fatalf("expected GetBatchTrail to succeed, got: %v", err)
	}
	if len(trail.IngredientRecords) != 1 || trail.IngredientRecords[0].IngredientNameSnapshot != "Aqua" {
		t.Fatalf("expected one Aqua ingredient record, got: %+v", trail.IngredientRecords)
	}
	if len(trail.ProductionRecords) != 1 || !trail.ProductionRecords[0].LineSegregationConfirmed {
		t.Fatalf("expected one confirmed production record, got: %+v", trail.ProductionRecords)
	}

	// The digest RecordVerdict will independently recompute must match what
	// GetBatchTrail hands the caller to attest over -- same underlying
	// function, but asserting the two calls agree guards against someone
	// later wiring GetBatchTrail to a different helper by mistake.
	wantDigest, err := computeEffectiveInputDigest(ctx, batch.BatchID)
	if err != nil {
		t.Fatalf("failed to independently compute digest: %v", err)
	}
	if trail.EffectiveInputDigest != wantDigest {
		t.Fatalf("expected EffectiveInputDigest %q to match computeEffectiveInputDigest %q", trail.EffectiveInputDigest, wantDigest)
	}
}

func TestGetBatchTrail_NonexistentBatchRejected(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	_, err := contract.GetBatchTrail(ctx, "SL-2026-999")
	if err == nil || !strings.Contains(err.Error(), "batch_not_found") {
		t.Fatalf("expected a batch_not_found rejection, got: %v", err)
	}
}

// No role restriction: any operational role may read a batch's own trail
// (TRD §23.4), matching every read function in refdata.
func TestGetBatchTrail_AnyRoleCanRead(t *testing.T) {
	ctx, batch := batchWithIngredient(t)
	contract := &BatchContract{}

	for _, role := range []string{"production_qa", "compliance_officer", "export_officer", "brand_owner", "system_admin"} {
		roleCtx := ctx.actingAs(t, "Org1MSP", role)
		if _, err := contract.GetBatchTrail(roleCtx, batch.BatchID); err != nil {
			t.Fatalf("expected GetBatchTrail to succeed for role %q, got: %v", role, err)
		}
	}
}

func TestListBatches_ReturnsEveryCreatedBatch(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	first, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected first CreateBatch to succeed, got: %v", err)
	}
	ctx.stub.txID = "second-batch-tx"
	second, err := contract.CreateBatch(ctx, "Indonesia")
	if err != nil {
		t.Fatalf("expected second CreateBatch to succeed, got: %v", err)
	}

	batches, err := contract.ListBatches(ctx)
	if err != nil {
		t.Fatalf("expected ListBatches to succeed, got: %v", err)
	}
	if len(batches) != 2 {
		t.Fatalf("expected 2 batches, got %d: %+v", len(batches), batches)
	}
	ids := map[string]bool{batches[0].BatchID: true, batches[1].BatchID: true}
	if !ids[first.BatchID] || !ids[second.BatchID] {
		t.Fatalf("expected both %q and %q in the list, got: %+v", first.BatchID, second.BatchID, batches)
	}
}

func TestListBatches_EmptyLedgerReturnsEmptySliceNotNull(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}

	batches, err := contract.ListBatches(ctx)
	if err != nil {
		t.Fatalf("expected ListBatches to succeed, got: %v", err)
	}
	if batches == nil {
		t.Fatal("expected [] not nil for an empty ledger")
	}
	if len(batches) != 0 {
		t.Fatalf("expected 0 batches, got %d", len(batches))
	}
}

// docs/04_trd.md §11: the ledger record carries the file's hash so the
// MinIO object key ("{batchId}/{recordType}/{sha256hash}.{ext}") is
// derivable from ledger data alone, and so Security Threat Model T-006's
// mitigation (re-hash on retrieval, compare against what's on-chain) has
// something real to compare against.
func TestSubmitIngredient_RecordsCoaFileHash(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Aqua", "e1", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", verifiedSupplier)

	const hash = "a1b2c3d4e5f6" // stand-in sha256 hex digest
	record, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "", hash)
	if err != nil {
		t.Fatalf("expected SubmitIngredient to succeed, got: %v", err)
	}
	if record.CoaFileHash != hash {
		t.Fatalf("expected CoaFileHash %q, got %q", hash, record.CoaFileHash)
	}

	trail, err := contract.GetBatchTrail(ctx, batch.BatchID)
	if err != nil {
		t.Fatalf("expected GetBatchTrail to succeed, got: %v", err)
	}
	if trail.IngredientRecords[0].CoaFileHash != hash {
		t.Fatalf("expected the trail's own copy of CoaFileHash to match, got: %q", trail.IngredientRecords[0].CoaFileHash)
	}
}

func TestSubmitIngredient_EmptyCoaFileHashOmittedFromJSON(t *testing.T) {
	ctx := newIdentityContext(t, "Org1MSP", "ingredient_qa")
	contract := &BatchContract{}
	batch, err := contract.CreateBatch(ctx, "Malaysia")
	if err != nil {
		t.Fatalf("expected CreateBatch to succeed, got: %v", err)
	}
	stubResolveActiveReference(ctx.stub, "ingredient", "Aqua", "e1", "1", "")
	stubResolveActiveReference(ctx.stub, "supplier", "PT Sumber Alam Nusantara", "e2", "1", verifiedSupplier)

	record, err := contract.SubmitIngredient(ctx, batch.BatchID, "Aqua", "PT Sumber Alam Nusantara", false, false, "", "")
	if err != nil {
		t.Fatalf("expected SubmitIngredient to succeed, got: %v", err)
	}
	recordJSON, err := json.Marshal(record)
	if err != nil {
		t.Fatalf("failed to marshal record: %v", err)
	}
	if strings.Contains(string(recordJSON), "coa_file_hash") {
		t.Fatalf("expected coa_file_hash to be omitted when empty (omitempty), got: %s", recordJSON)
	}
}
