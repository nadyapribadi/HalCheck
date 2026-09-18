// Package main implements the batch chaincode module: the batch lifecycle
// (ingredient sourcing -> production -> compliance verdict -> export),
// role-scoped and sequenced, append-only. See docs/04_trd.md §7,
// docs/06_erd.md BATCH, and docs/18_vibe_coding_guardrails.md §3 for the
// rules this module must hold to.
package main

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"strings"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// IntendedMarket is a closed enum. Values match Compliance Trail's own
// established contract exactly -- docs/17_api_reference.md §4
// ("intendedMarket": "Malaysia"), docs/11_screen_requirements.md §3, and
// docs/12_seed_data_specification.md all use the capitalized full country
// name, never a lowercase code. (The Core Screening App's engine uses
// lowercase "indonesia"/"malaysia" internally -- that's a separate system
// with its own contract, not something this module should copy from.)
type IntendedMarket string

const (
	MarketIndonesia IntendedMarket = "Indonesia"
	MarketMalaysia  IntendedMarket = "Malaysia"
)

func (m IntendedMarket) valid() bool {
	switch m {
	case MarketIndonesia, MarketMalaysia:
		return true
	default:
		return false
	}
}

// Batch mirrors docs/06_erd.md's BATCH entity. Status is deliberately not
// stored here -- it's derived by the backend from the latest child record
// present for a batch (ERD, BATCH entry dictionary).
type Batch struct {
	BatchID        string         `json:"batch_id"`
	CreatedAt      string         `json:"created_at"`
	IntendedMarket IntendedMarket `json:"intended_market"`
}

// BatchContract implements the batch chaincode functions.
type BatchContract struct {
	contractapi.Contract
}

// requireRole rejects the call unless the invoking identity's certificate
// carries the given role attribute -- the real certificate attribute,
// never a client-supplied string (Guardrails §3 Rule 1). Mirrors
// chaincode/refdata's requireSystemAdmin.
func requireRole(ctx contractapi.TransactionContextInterface, role string) error {
	err := cid.AssertAttributeValue(ctx.GetStub(), "role", role)
	if err != nil {
		return fmt.Errorf("role_scope_violation: caller is not %s: %w", role, err)
	}
	return nil
}

func batchKey(ctx contractapi.TransactionContextInterface, batchID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("batch", []string{batchID})
}

func batchCounterKey(ctx contractapi.TransactionContextInterface, year int) (string, error) {
	return ctx.GetStub().CreateCompositeKey("batchCounter", []string{fmt.Sprintf("%d", year)})
}

// requireBatchExists reads back a batch's own record, rejecting with the
// same batch_not_found error every batch-scoped function in this module
// already uses when a caller's batch_id doesn't exist on the ledger.
func requireBatchExists(ctx contractapi.TransactionContextInterface, batchID string) (*Batch, error) {
	bKey, err := batchKey(ctx, batchID)
	if err != nil {
		return nil, fmt.Errorf("failed to build batch key: %w", err)
	}
	batchBytes, err := ctx.GetStub().GetState(bKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if batchBytes == nil {
		return nil, fmt.Errorf("batch_not_found: batch %q does not exist", batchID)
	}
	var batch Batch
	if err := json.Unmarshal(batchBytes, &batch); err != nil {
		return nil, fmt.Errorf("failed to unmarshal batch: %w", err)
	}
	return &batch, nil
}

// CreateBatch starts a new batch, capturing Intended Market immutably at
// creation (FRD-CHAIN-BATCH-001) -- this is what closes the recognition-
// directionality sequencing gap the batch/verdict flow used to have, since
// the compliance engine now always has the destination market before a
// verdict is ever computed. No function in this module ever accepts or
// writes a different value for an existing batch's intended_market -- that
// immutability is structural (no UpdateBatch function exists at all), not
// just policy. Ingredient QA only (UI Flow §8).
func (c *BatchContract) CreateBatch(
	ctx contractapi.TransactionContextInterface,
	intendedMarket string,
) (*Batch, error) {
	if err := requireRole(ctx, "ingredient_qa"); err != nil {
		return nil, err
	}

	market := IntendedMarket(intendedMarket)
	if !market.valid() {
		return nil, fmt.Errorf("invalid_market: %q is not one of Indonesia, Malaysia", intendedMarket)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to read transaction timestamp: %w", err)
	}
	createdAt := time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC()

	batchID, err := c.nextBatchID(ctx, createdAt.Year())
	if err != nil {
		return nil, err
	}

	batch := Batch{
		BatchID:        batchID,
		CreatedAt:      createdAt.Format(time.RFC3339),
		IntendedMarket: market,
	}

	batchJSON, err := json.Marshal(batch)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal batch: %w", err)
	}

	key, err := batchKey(ctx, batchID)
	if err != nil {
		return nil, fmt.Errorf("failed to build batch key: %w", err)
	}

	if err := ctx.GetStub().PutState(key, batchJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	return &batch, nil
}

// ListBatches returns every batch on the ledger -- lightweight (just the
// Batch record, not each one's full trail; a caller wanting a specific
// batch's records still calls GetBatchTrail). No role restriction, matching
// every other read function in this module and refdata: any operational
// role may need to see what batches exist (TRD §23.4). "batch" is its own
// composite-key namespace (batchKey), distinct from "batchCounter", so this
// iterates only real batches.
func (c *BatchContract) ListBatches(ctx contractapi.TransactionContextInterface) ([]*Batch, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("batch", []string{})
	if err != nil {
		return nil, fmt.Errorf("failed to query batches: %w", err)
	}
	defer iterator.Close()

	batches := make([]*Batch, 0)
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to read next batch: %w", err)
		}
		var batch Batch
		if err := json.Unmarshal(kv.GetValue(), &batch); err != nil {
			return nil, fmt.Errorf("failed to unmarshal batch: %w", err)
		}
		batches = append(batches, &batch)
	}
	return batches, nil
}

// nextBatchID allocates the next SL-YYYY-NNN sequence number for the given
// year (ERD: `batch_id PK "format SL-YYYY-NNN"`). Reading then writing the
// same counter key means two genuinely concurrent CreateBatch calls in the
// same year collide on this exact key -- Fabric's native MVCC rejects the
// loser with MVCC_READ_CONFLICT rather than letting both succeed with the
// same batch ID (ADR-CT-022: no custom locking). Demo-scale by design
// (docs/07_test_strategy.md §6): a single contested counter key is an
// accepted throughput ceiling, not a defect, at this project's scale.
func (c *BatchContract) nextBatchID(ctx contractapi.TransactionContextInterface, year int) (string, error) {
	counterKey, err := batchCounterKey(ctx, year)
	if err != nil {
		return "", fmt.Errorf("failed to build batch counter key: %w", err)
	}

	counterBytes, err := ctx.GetStub().GetState(counterKey)
	if err != nil {
		return "", fmt.Errorf("failed to read batch counter: %w", err)
	}

	next := 1
	if counterBytes != nil {
		var last int
		if err := json.Unmarshal(counterBytes, &last); err != nil {
			return "", fmt.Errorf("failed to unmarshal batch counter: %w", err)
		}
		next = last + 1
	}

	nextBytes, err := json.Marshal(next)
	if err != nil {
		return "", fmt.Errorf("failed to marshal batch counter: %w", err)
	}
	if err := ctx.GetStub().PutState(counterKey, nextBytes); err != nil {
		return "", fmt.Errorf("failed to write batch counter: %w", err)
	}

	return fmt.Sprintf("SL-%d-%03d", year, next), nil
}

// IngredientRecord mirrors docs/06_erd.md's INGREDIENT_RECORD.
// SupersedesRecordID is empty for a plain SubmitIngredient call and set to
// the flagged record's ID for a CorrectIngredient call below -- the two
// functions share field-resolution logic (recordIngredient) but enforce
// different role/state preconditions per FRD-CHAIN-LEDGER-005/TRD §23.5.
// Note on the metadata struct tags below: contractapi generates its own
// JSON schema from these tags for response validation, and it is NOT
// driven by the json tag's `omitempty` -- a field is schema-required
// unless it carries its own `metadata:"...,optional"` tag. This exact gap
// broke refdata.ReferenceEntry on its first real network invocation (unit
// tests bypass contractapi's schema-validation layer entirely, calling
// these functions directly) -- fixed proactively here for the same reason.
type IngredientRecord struct {
	RecordID                   string `json:"record_id" metadata:"record_id"`
	BatchID                    string `json:"batch_id" metadata:"batch_id"`
	UploadSessionID            string `json:"upload_session_id,omitempty" metadata:"upload_session_id,optional"`
	IngredientNameSnapshot     string `json:"ingredient_name_snapshot" metadata:"ingredient_name_snapshot"`
	IngredientReferenceEntryID string `json:"ingredient_reference_entry_id" metadata:"ingredient_reference_entry_id"`
	IngredientReferenceVersion string `json:"ingredient_reference_version" metadata:"ingredient_reference_version"`
	SourceSnapshot             string `json:"source_snapshot" metadata:"source_snapshot"`
	SupplierReferenceEntryID   string `json:"supplier_reference_entry_id" metadata:"supplier_reference_entry_id"`
	SupplierReferenceVersion   string `json:"supplier_reference_version" metadata:"supplier_reference_version"`
	// SupplierVerificationStatus is the supplier reference entry's own
	// verification status, snapshotted at submission (`verified` /
	// `unverified` in the governed data, but stored verbatim rather than
	// validated against a closed enum here -- refdata owns that vocabulary,
	// and the verdict engine's own rule is "anything other than verified is
	// not verified", so a value this module doesn't recognize can never be
	// silently read as verified).
	//
	// This exists because of ADR-CT-033: the verdict engine judges
	// unverified_ingredient_source from the batch's own records, and the
	// signed attestation binds only those records -- a fact held outside
	// them makes the signature attest to an incomplete input set. Same
	// "denormalized snapshot, not a live foreign key" rule ADR-CT-024
	// settled for standards.
	//
	// The struct tag is deliberately `optional`: records written before
	// this field existed live on the ledger immutably and come back
	// through GetBatchTrail with it empty, and a schema-required string
	// would fail contractapi's response validation for exactly those
	// records (the P2 incident, docs/14_developer_setup.md §1.3). The
	// absence of the field is what marks such a record as pre-ADR-CT-033
	// to the backend's compatibility path -- see verdict/build.ts, which
	// is the only place allowed to know that.
	SupplierVerificationStatus string `json:"supplier_verification_status,omitempty" metadata:"supplier_verification_status,optional"`
	HalalRiskFlag              bool   `json:"halal_risk_flag" metadata:"halal_risk_flag"`
	OverrideReason             string `json:"override_reason,omitempty" metadata:"override_reason,optional"`
	// CoaFileHash is the sha256 of an attached Certificate of Analysis, if
	// one was uploaded (docs/04_trd.md §11: object key
	// "{batchId}/{recordType}/{sha256hash}.{ext}" is derivable from this
	// plus BatchID -- no separate lookup table needed. Recording the hash
	// here, not just in the file store, is what makes Security Threat
	// Model T-006's mitigation real: a swapped file is caught by
	// re-hashing on retrieval and comparing against THIS ledger value, the
	// one thing a file-store-side swap can't also silently rewrite.
	CoaFileHash        string `json:"coa_file_hash,omitempty" metadata:"coa_file_hash,optional"`
	SupersedesRecordID string `json:"supersedes_record_id,omitempty" metadata:"supersedes_record_id,optional"`
	Timestamp          string `json:"timestamp" metadata:"timestamp"`
	SubmittedBy        string `json:"submitted_by" metadata:"submitted_by"`
}

// resolvedReference is batch's own mirror of refdata.ReferenceEntry's JSON
// shape. batch and refdata are two independent Go modules (TRD §3) --
// batch can't import refdata's package, so this local type exists purely
// to unmarshal what refdata.ResolveActiveReference returns over
// InvokeChaincode. Only the fields batch actually needs are declared;
// encoding/json ignores the rest, so this stays correct even as refdata's
// full struct grows.
type resolvedReference struct {
	EntryID  string `json:"entry_id"`
	Value    string `json:"value"`
	Version  string `json:"version"`
	Metadata string `json:"metadata,omitempty"`
}

type ingredientMetadata struct {
	DefaultHalalRisk bool `json:"defaultHalalRisk"`
}

// supplierMetadata mirrors the supplier-typed metadata shape the governed
// reference list uses (dataset/releases/*/suppliers.json, and what the
// System Admin's add-entry route passes through as `metadata`).
//
// ADR-CT-033 makes VerificationStatus a requirement rather than an
// optional extra: the verdict engine's unverified_ingredient_source rule
// is decided on this value, and the signed attestation binds only the
// batch's own records. A submission whose supplier has no answer to give
// is therefore refused *here*, at the point the fact is captured, instead
// of recording an empty value that would later have to be re-derived from
// a source outside the digest (exactly the drift ADR-CT-033 removes) or
// silently read as unverified. Same fail-closed discipline as ADR-CT-030's
// storage_unavailable for a missing COA hash.
type supplierMetadata struct {
	VerificationStatus string `json:"verificationStatus"`
}

// resolveReference calls refdata.ResolveActiveReference via genuine
// cross-chaincode invocation (TRD §23.1) -- not a same-namespace GetState,
// which wouldn't even see refdata's state; Fabric namespaces ledger state
// per chaincode. This is the actual chaincode-level enforcement point for
// FRD-CHAIN-UPLOAD-009 ("batch chaincode must validate ... through the
// on-ledger refdata.ResolveActiveReference contract on every submission
// path"). refdata's own rejection message (already reason-coded
// not_a_recognized_value) is propagated unchanged, not re-derived here --
// one place owns what "not recognized" means.
func (c *BatchContract) resolveReference(
	ctx contractapi.TransactionContextInterface,
	entryType string,
	value string,
) (*resolvedReference, error) {
	args := [][]byte{[]byte("ResolveActiveReference"), []byte(entryType), []byte(value)}
	response := ctx.GetStub().InvokeChaincode("refdata", args, ctx.GetStub().GetChannelID())

	if response.GetStatus() != 200 {
		return nil, fmt.Errorf("%s", response.GetMessage())
	}

	var resolved resolvedReference
	if err := json.Unmarshal(response.GetPayload(), &resolved); err != nil {
		return nil, fmt.Errorf("failed to unmarshal resolved reference: %w", err)
	}
	return &resolved, nil
}

func ingredientRecordKey(ctx contractapi.TransactionContextInterface, batchID string, recordID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("ingredientRecord", []string{batchID, recordID})
}

// SubmitIngredient records a single ingredient against an existing batch
// (FRD-CHAIN-UPLOAD-004: manual single-ingredient addition, append-only).
// Ingredient QA only (FRD-CHAIN-ROLE-001). Ingredient Name and Source are
// resolved against refdata in this same transaction and stored as an
// immutable snapshot (TRD §5, §23.1) -- record_id, ingredient_reference_
// entry_id, and supplier_reference_entry_id, once written, are never
// touched by any other function in this file.
//
// isOverride/overrideHalalRisk/overrideReason implement
// FRD-CHAIN-UPLOAD-008: the flag auto-populates from the matched
// ingredient's default classification; overriding it requires an explicit
// reason, recorded alongside the override, not silently accepted.
func (c *BatchContract) SubmitIngredient(
	ctx contractapi.TransactionContextInterface,
	batchID string,
	ingredientName string,
	source string,
	isOverride bool,
	overrideHalalRisk bool,
	overrideReason string,
	coaFileHash string,
) (*IngredientRecord, error) {
	if err := requireRole(ctx, "ingredient_qa"); err != nil {
		return nil, err
	}

	if _, err := requireBatchExists(ctx, batchID); err != nil {
		return nil, err
	}

	return c.recordIngredient(ctx, batchID, ingredientName, source, isOverride, overrideHalalRisk, overrideReason, coaFileHash, "")
}

// CorrectIngredient submits a correction for the single ingredient record
// currently flagged by the batch's own recorded verdict
// (FRD-CHAIN-LEDGER-002/005, TRD §23.5: "Only the owner role may correct
// that exact, unsuperseded flagged record ... while the latest effective
// verdict is Fail"). There is deliberately no parameter identifying which
// record to correct -- currentFlaggedRecord derives it from the batch's own
// latest verdict, the same way Screen Requirements §6 describes the
// correction screen working, so a caller cannot correct the wrong record
// even by mistake. The original flagged record is never touched; this
// writes a brand-new record with SupersedesRecordID set, leaving every
// other ingredient record on the batch exactly as it was.
func (c *BatchContract) CorrectIngredient(
	ctx contractapi.TransactionContextInterface,
	batchID string,
	ingredientName string,
	source string,
	isOverride bool,
	overrideHalalRisk bool,
	overrideReason string,
	coaFileHash string,
) (*IngredientRecord, error) {
	if err := requireRole(ctx, "ingredient_qa"); err != nil {
		return nil, err
	}

	if _, err := requireBatchExists(ctx, batchID); err != nil {
		return nil, err
	}

	flaggedRecordID, err := c.currentFlaggedRecord(ctx, batchID, "ingredientRecord")
	if err != nil {
		return nil, err
	}

	alreadyCorrected, err := c.isSuperseded(ctx, "ingredientRecord", batchID, flaggedRecordID)
	if err != nil {
		return nil, err
	}
	if alreadyCorrected {
		return nil, fmt.Errorf("duplicate_entry: the flagged ingredient record has already been corrected")
	}

	return c.recordIngredient(ctx, batchID, ingredientName, source, isOverride, overrideHalalRisk, overrideReason, coaFileHash, flaggedRecordID)
}

// recordIngredient resolves references and writes the record shared by
// SubmitIngredient (supersedesRecordID == "") and CorrectIngredient
// (supersedesRecordID == the flagged record's ID) -- both submit the exact
// same field shape; only the role/state preconditions checked by their
// respective callers above differ.
func (c *BatchContract) recordIngredient(
	ctx contractapi.TransactionContextInterface,
	batchID string,
	ingredientName string,
	source string,
	isOverride bool,
	overrideHalalRisk bool,
	overrideReason string,
	coaFileHash string,
	supersedesRecordID string,
) (*IngredientRecord, error) {
	ingredientRef, err := c.resolveReference(ctx, "ingredient", ingredientName)
	if err != nil {
		return nil, err
	}
	supplierRef, err := c.resolveReference(ctx, "supplier", source)
	if err != nil {
		return nil, err
	}

	var meta ingredientMetadata
	if ingredientRef.Metadata != "" {
		if err := json.Unmarshal([]byte(ingredientRef.Metadata), &meta); err != nil {
			return nil, fmt.Errorf("failed to unmarshal ingredient metadata: %w", err)
		}
	}

	var supplierMeta supplierMetadata
	if supplierRef.Metadata != "" {
		if err := json.Unmarshal([]byte(supplierRef.Metadata), &supplierMeta); err != nil {
			return nil, fmt.Errorf("failed to unmarshal supplier metadata: %w", err)
		}
	}
	if supplierMeta.VerificationStatus == "" {
		return nil, fmt.Errorf(
			"missing_reference_metadata: supplier %q has no verificationStatus in its reference metadata, so this ingredient's compliance fact cannot be bound to the record; a System Admin must add the status as a new version of that entry first",
			supplierRef.Value,
		)
	}

	halalRiskFlag := meta.DefaultHalalRisk
	recordedOverrideReason := ""
	if isOverride {
		if overrideReason == "" {
			return nil, fmt.Errorf("missing_field: overrideReason is required when overriding the default Halal Risk classification")
		}
		halalRiskFlag = overrideHalalRisk
		recordedOverrideReason = overrideReason
	}

	submittedBy, err := cid.GetID(ctx.GetStub())
	if err != nil {
		return nil, fmt.Errorf("failed to resolve caller identity: %w", err)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to read transaction timestamp: %w", err)
	}

	record := IngredientRecord{
		RecordID:                   ctx.GetStub().GetTxID(),
		BatchID:                    batchID,
		IngredientNameSnapshot:     ingredientRef.Value,
		IngredientReferenceEntryID: ingredientRef.EntryID,
		IngredientReferenceVersion: ingredientRef.Version,
		SourceSnapshot:             supplierRef.Value,
		SupplierReferenceEntryID:   supplierRef.EntryID,
		SupplierReferenceVersion:   supplierRef.Version,
		SupplierVerificationStatus: supplierMeta.VerificationStatus,
		HalalRiskFlag:              halalRiskFlag,
		OverrideReason:             recordedOverrideReason,
		CoaFileHash:                coaFileHash,
		SupersedesRecordID:         supersedesRecordID,
		Timestamp:                  time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC().Format(time.RFC3339),
		SubmittedBy:                submittedBy,
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal ingredient record: %w", err)
	}

	key, err := ingredientRecordKey(ctx, batchID, record.RecordID)
	if err != nil {
		return nil, fmt.Errorf("failed to build ingredient record key: %w", err)
	}

	if err := ctx.GetStub().PutState(key, recordJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	return &record, nil
}

// ProductionRecord mirrors docs/06_erd.md's PRODUCTION_RECORD.
// SupersedesRecordID is empty for a plain ConfirmProduction call and set to
// the flagged record's ID for a CorrectProduction call below, matching how
// IngredientRecord's SupersedesRecordID works (TRD §23.5).
type ProductionRecord struct {
	RecordID                 string `json:"record_id" metadata:"record_id"`
	BatchID                  string `json:"batch_id" metadata:"batch_id"`
	BatchDate                string `json:"batch_date" metadata:"batch_date"`
	LineSegregationConfirmed bool   `json:"line_segregation_confirmed" metadata:"line_segregation_confirmed"`
	StandardSnapshot         string `json:"standard_snapshot" metadata:"standard_snapshot"`
	StandardReferenceEntryID string `json:"standard_reference_entry_id" metadata:"standard_reference_entry_id"`
	StandardReferenceVersion string `json:"standard_reference_version" metadata:"standard_reference_version"`
	SupersedesRecordID       string `json:"supersedes_record_id,omitempty" metadata:"supersedes_record_id,optional"`
	Timestamp                string `json:"timestamp" metadata:"timestamp"`
	SubmittedBy              string `json:"submitted_by" metadata:"submitted_by"`
}

// productionStandardValue is the one manufacturing standard production
// records reference -- fixed and auto-filled, not chosen by the caller
// (Screen Requirements §7: "Standard: display-only, auto-filled (CPKB)").
const productionStandardValue = "CPKB"

func productionRecordKey(ctx contractapi.TransactionContextInterface, batchID string, recordID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("productionRecord", []string{batchID, recordID})
}

// hasAnyRecord checks whether at least one record of the given type exists
// for a batch -- used both for FRD-CHAIN-SEQUENCE-001 (does an ingredient
// record exist yet) and for rejecting a second plain production
// confirmation (does one already exist).
func (c *BatchContract) hasAnyRecord(ctx contractapi.TransactionContextInterface, objectType string, batchID string) (bool, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(objectType, []string{batchID})
	if err != nil {
		return false, fmt.Errorf("failed to query %s records: %w", objectType, err)
	}
	defer iterator.Close()
	return iterator.HasNext(), nil
}

// ConfirmProduction records production confirmation for a batch
// (FRD-CHAIN-PROD-001/002). Production QA only (FRD-CHAIN-ROLE-002).
// Requires a prior ingredient record for the same batch
// (FRD-CHAIN-SEQUENCE-001) and rejects a second plain confirmation once one
// already exists -- a further confirmation is only ever valid as an
// explicit correction via CorrectProduction below.
//
// BatchDate is never accepted as a parameter -- it is always the
// transaction timestamp (FRD-CHAIN-PROD-002: "system-populated ... not
// manually editable by any role"). The governing standard (CPKB) is
// resolved through refdata in this same transaction, exactly like
// SubmitIngredient resolves ingredient/supplier (FRD-CHAIN-STANDARDS-004).
func (c *BatchContract) ConfirmProduction(
	ctx contractapi.TransactionContextInterface,
	batchID string,
	lineSegregationConfirmed bool,
) (*ProductionRecord, error) {
	if err := requireRole(ctx, "production_qa"); err != nil {
		return nil, err
	}

	if _, err := requireBatchExists(ctx, batchID); err != nil {
		return nil, err
	}

	hasIngredient, err := c.hasAnyRecord(ctx, "ingredientRecord", batchID)
	if err != nil {
		return nil, err
	}
	if !hasIngredient {
		return nil, fmt.Errorf("sequencing_violation: batch %q has no ingredient record yet", batchID)
	}

	hasProduction, err := c.hasAnyRecord(ctx, "productionRecord", batchID)
	if err != nil {
		return nil, err
	}
	if hasProduction {
		return nil, fmt.Errorf("duplicate_entry: batch %q already has a production record; submit a correction instead", batchID)
	}

	return c.recordProduction(ctx, batchID, lineSegregationConfirmed, "")
}

// CorrectProduction submits a correction for the single production record
// currently flagged by the batch's own recorded verdict, matching
// CorrectIngredient's design exactly (TRD §23.5). Production QA only -- the
// owner role for production records, not whoever happens to be fixing the
// batch generally.
func (c *BatchContract) CorrectProduction(
	ctx contractapi.TransactionContextInterface,
	batchID string,
	lineSegregationConfirmed bool,
) (*ProductionRecord, error) {
	if err := requireRole(ctx, "production_qa"); err != nil {
		return nil, err
	}

	if _, err := requireBatchExists(ctx, batchID); err != nil {
		return nil, err
	}

	flaggedRecordID, err := c.currentFlaggedRecord(ctx, batchID, "productionRecord")
	if err != nil {
		return nil, err
	}

	alreadyCorrected, err := c.isSuperseded(ctx, "productionRecord", batchID, flaggedRecordID)
	if err != nil {
		return nil, err
	}
	if alreadyCorrected {
		return nil, fmt.Errorf("duplicate_entry: the flagged production record has already been corrected")
	}

	return c.recordProduction(ctx, batchID, lineSegregationConfirmed, flaggedRecordID)
}

// recordProduction resolves the governing standard and writes the record
// shared by ConfirmProduction (supersedesRecordID == "") and
// CorrectProduction (supersedesRecordID == the flagged record's ID).
func (c *BatchContract) recordProduction(
	ctx contractapi.TransactionContextInterface,
	batchID string,
	lineSegregationConfirmed bool,
	supersedesRecordID string,
) (*ProductionRecord, error) {
	standardRef, err := c.resolveReference(ctx, "standard", productionStandardValue)
	if err != nil {
		return nil, err
	}

	submittedBy, err := cid.GetID(ctx.GetStub())
	if err != nil {
		return nil, fmt.Errorf("failed to resolve caller identity: %w", err)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to read transaction timestamp: %w", err)
	}
	ts := time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC().Format(time.RFC3339)

	record := ProductionRecord{
		RecordID:                 ctx.GetStub().GetTxID(),
		BatchID:                  batchID,
		BatchDate:                ts,
		LineSegregationConfirmed: lineSegregationConfirmed,
		StandardSnapshot:         standardRef.Value,
		StandardReferenceEntryID: standardRef.EntryID,
		StandardReferenceVersion: standardRef.Version,
		SupersedesRecordID:       supersedesRecordID,
		Timestamp:                ts,
		SubmittedBy:              submittedBy,
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal production record: %w", err)
	}

	key, err := productionRecordKey(ctx, batchID, record.RecordID)
	if err != nil {
		return nil, fmt.Errorf("failed to build production record key: %w", err)
	}

	if err := ctx.GetStub().PutState(key, recordJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	return &record, nil
}

// verdictAttestationPublicKeyPEM is committed with this chaincode
// definition, not stored as mutable ledger state (TRD §23.2: "A
// verification-key change requires a reviewed chaincode lifecycle
// upgrade"). The matching private key lives outside this repository
// entirely, under the same discipline as every other piece of generated
// Fabric crypto material -- see docs/14_developer_setup.md §1.4. This is
// the real backend's (P4) signing key -- backend/src/verdict/sign.ts holds
// the private half.
const verdictAttestationPublicKeyPEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAELaxgFn/pJwcCaNyj57eABcZR2lSn
p9LMHEAw0EgdFR5xg7eZuZvCeiX9XQ1Nj71Hw/uu2rI2bnPxAx6+TKf4TA==
-----END PUBLIC KEY-----`

var verdictAttestationPublicKey = mustParseECDSAPublicKey(verdictAttestationPublicKeyPEM)

func mustParseECDSAPublicKey(pemStr string) *ecdsa.PublicKey {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		panic("invalid verdict attestation public key PEM")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		panic(fmt.Sprintf("invalid verdict attestation public key: %v", err))
	}
	ecdsaPub, ok := pub.(*ecdsa.PublicKey)
	if !ok {
		panic("verdict attestation public key is not ECDSA")
	}
	return ecdsaPub
}

// verifyAttestationSignature checks payload's SHA-256 digest against
// signatureBase64 using the compiled-in public key. A package-level var
// (not a literal call site) so tests can swap in a freshly-generated test
// keypair for the duration of a single test, without ever touching the
// real private key (which isn't in this repo at all).
func verifyAttestationSignature(payload []byte, signatureBase64 string) error {
	signature, err := base64.StdEncoding.DecodeString(signatureBase64)
	if err != nil {
		return fmt.Errorf("attestation_invalid: invalid signature encoding: %v", err)
	}
	digest := sha256.Sum256(payload)
	if !ecdsa.VerifyASN1(verdictAttestationPublicKey, digest[:], signature) {
		return fmt.Errorf("attestation_invalid: signature verification failed")
	}
	return nil
}

// VerdictAttestation is the signed payload the (future) backend obtains
// from the compliance engine (TRD §23.2) and submits to RecordVerdict.
// Every field here is what actually determines the verdict -- RecordVerdict
// accepts no client-supplied verdict fields beyond this one signed blob.
type VerdictAttestation struct {
	BatchID          string            `json:"batch_id"`
	InputDigest      string            `json:"input_digest"`
	IntendedMarket   string            `json:"intended_market"`
	EngineVersion    string            `json:"engine_version"`
	RulesRelease     string            `json:"rules_release"`
	Result           string            `json:"result"` // "pass" | "fail"
	RegulationValue  string            `json:"regulation_value"`
	FailReason       string            `json:"fail_reason,omitempty"`
	FlaggedRecordID  string            `json:"flagged_record_id,omitempty"`
	RecognitionCheck *RecognitionCheck `json:"recognition_check,omitempty"`
}

// RecognitionCheck mirrors docs/06_erd.md's VERDICT_RECORD.recognition_check
// JSON blob, evaluated by the engine using BATCH.intended_market.
type RecognitionCheck struct {
	IssuingBody   string `json:"issuing_body" metadata:"issuing_body"`
	RequiringBody string `json:"requiring_body" metadata:"requiring_body"`
	Recognized    bool   `json:"recognized" metadata:"recognized"`
	AsOfDate      string `json:"as_of_date" metadata:"as_of_date"`
}

// VerdictRecord mirrors docs/06_erd.md's VERDICT_RECORD. This first version
// covers plain recording only -- there is no correction mode for verdicts
// themselves (a Fail is corrected by correcting the flagged ingredient or
// production record and recording a fresh verdict, not by editing this
// record; see TRD §23.5).
type VerdictRecord struct {
	RecordID                   string            `json:"record_id" metadata:"record_id"`
	BatchID                    string            `json:"batch_id" metadata:"batch_id"`
	Status                     string            `json:"status" metadata:"status"`
	RegulationSnapshot         string            `json:"regulation_snapshot" metadata:"regulation_snapshot"`
	RegulationReferenceEntryID string            `json:"regulation_reference_entry_id" metadata:"regulation_reference_entry_id"`
	RegulationReferenceVersion string            `json:"regulation_reference_version" metadata:"regulation_reference_version"`
	FailReasonSnapshot         string            `json:"fail_reason_snapshot,omitempty" metadata:"fail_reason_snapshot,optional"`
	FailReasonReferenceEntryID string            `json:"fail_reason_reference_entry_id,omitempty" metadata:"fail_reason_reference_entry_id,optional"`
	FailReasonReferenceVersion string            `json:"fail_reason_reference_version,omitempty" metadata:"fail_reason_reference_version,optional"`
	FlaggedRecordID            string            `json:"flagged_record_id,omitempty" metadata:"flagged_record_id,optional"`
	EngineAttestationDigest    string            `json:"engine_attestation_digest" metadata:"engine_attestation_digest"`
	// EngineAttestation/EngineAttestationSignature are the signed payload and
	// its ECDSA signature, stored verbatim (ADR-CT-034). Before this they were
	// verified at RecordVerdict time and then discarded, which left the
	// attestation unverifiable by anyone afterwards -- the digest alone proves
	// what was evaluated, not who attested to it. Optional because verdicts
	// recorded before this change have neither field, and a schema-required
	// string would fail contractapi's response validation for exactly those
	// records (the ADR-CT-033 lesson).
	EngineAttestation          string            `json:"engine_attestation,omitempty" metadata:"engine_attestation,optional"`
	EngineAttestationSignature string            `json:"engine_attestation_signature,omitempty" metadata:"engine_attestation_signature,optional"`
	EngineVersion              string            `json:"engine_version" metadata:"engine_version"`
	RulesRelease               string            `json:"rules_release" metadata:"rules_release"`
	RecognitionCheck           *RecognitionCheck `json:"recognition_check,omitempty" metadata:"recognition_check,optional"`
	Timestamp                  string            `json:"timestamp" metadata:"timestamp"`
	SubmittedBy                string            `json:"submitted_by" metadata:"submitted_by"`
}

func verdictRecordKey(ctx contractapi.TransactionContextInterface, batchID string, recordID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("verdictRecord", []string{batchID, recordID})
}

// latestVerdictPointerKey is a single, always-overwritten key per batch
// holding the most recently recorded verdict. Multiple verdicts can
// legitimately exist over a batch's life (Fail -> correction -> a fresh
// Pass, TRD §23.5), and their record_id values are transaction IDs, not a
// sortable sequence -- there's no ordering to recover from range-querying
// verdictRecord alone. Wall-clock Timestamp comparison was considered and
// rejected: two verdicts recorded within the same second (a real
// possibility, and definitely possible against a mocked, fixed test
// timestamp) would tie. This pointer sidesteps the ordering problem
// entirely by construction -- whichever RecordVerdict call runs last is,
// by definition, the one that wrote it last.
func latestVerdictPointerKey(ctx contractapi.TransactionContextInterface, batchID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("latestVerdictPointer", []string{batchID})
}

// recordExists checks whether recordID exists as either an ingredient or a
// production record on this batch -- used to validate a Fail attestation's
// flagged_record_id actually points at something real (FRD-CHAIN-VERDICT-007).
func (c *BatchContract) recordExists(ctx contractapi.TransactionContextInterface, batchID string, recordID string) (bool, error) {
	for _, objectType := range []string{"ingredientRecord", "productionRecord"} {
		key, err := ctx.GetStub().CreateCompositeKey(objectType, []string{batchID, recordID})
		if err != nil {
			return false, fmt.Errorf("failed to build %s key: %w", objectType, err)
		}
		value, err := ctx.GetStub().GetState(key)
		if err != nil {
			return false, fmt.Errorf("failed to read world state: %w", err)
		}
		if value != nil {
			return true, nil
		}
	}
	return false, nil
}

// currentFlaggedRecord returns the record ID flagged by a batch's current
// (latest, via latestVerdictPointerKey) verdict, requiring that verdict to
// be a Fail that actually flagged a record of the given type -- TRD §23.5:
// "Only the owner role may correct that exact, unsuperseded flagged record
// ... while the latest effective verdict is Fail." There is deliberately no
// parameter anywhere in this module for a caller to name which record to
// correct; it is always derived from the ledger's own state, the same way
// Screen Requirements §6 describes the correction screen working ("shows
// only the single flagged ... record, identified via the Fail verdict's
// flagged_record_id").
func (c *BatchContract) currentFlaggedRecord(ctx contractapi.TransactionContextInterface, batchID string, objectType string) (string, error) {
	pointerKey, err := latestVerdictPointerKey(ctx, batchID)
	if err != nil {
		return "", fmt.Errorf("failed to build latest verdict pointer key: %w", err)
	}
	latestVerdictBytes, err := ctx.GetStub().GetState(pointerKey)
	if err != nil {
		return "", fmt.Errorf("failed to read world state: %w", err)
	}
	if latestVerdictBytes == nil {
		return "", fmt.Errorf("sequencing_violation: batch %q has no recorded verdict to correct", batchID)
	}
	var latestVerdict VerdictRecord
	if err := json.Unmarshal(latestVerdictBytes, &latestVerdict); err != nil {
		return "", fmt.Errorf("failed to unmarshal latest verdict: %w", err)
	}
	if latestVerdict.Status != "fail" {
		return "", fmt.Errorf("sequencing_violation: batch %q's current verdict is not fail; there is nothing to correct", batchID)
	}

	flaggedKey, err := ctx.GetStub().CreateCompositeKey(objectType, []string{batchID, latestVerdict.FlaggedRecordID})
	if err != nil {
		return "", fmt.Errorf("failed to build %s key: %w", objectType, err)
	}
	flaggedBytes, err := ctx.GetStub().GetState(flaggedKey)
	if err != nil {
		return "", fmt.Errorf("failed to read world state: %w", err)
	}
	if flaggedBytes == nil {
		kind := strings.TrimSuffix(objectType, "Record")
		return "", fmt.Errorf("sequencing_violation: the current Fail verdict did not flag any %s record on this batch", kind)
	}

	return latestVerdict.FlaggedRecordID, nil
}

// isSuperseded reports whether any record of the given type on this batch
// already carries supersedes_record_id == recordID -- i.e. recordID has
// already been corrected once. Only one correction is ever valid per
// flagged record (TRD §23.5 describes correcting "that exact ... record,"
// singular); a second attempt is rejected as a duplicate, the same
// discipline ConfirmProduction already applies to a second plain
// confirmation.
func (c *BatchContract) isSuperseded(ctx contractapi.TransactionContextInterface, objectType string, batchID string, recordID string) (bool, error) {
	values, err := collectRecordValues(ctx, objectType, batchID)
	if err != nil {
		return false, err
	}
	for _, v := range values {
		var withSupersedes struct {
			SupersedesRecordID string `json:"supersedes_record_id"`
		}
		if err := json.Unmarshal(v, &withSupersedes); err != nil {
			return false, fmt.Errorf("failed to unmarshal %s record: %w", objectType, err)
		}
		if withSupersedes.SupersedesRecordID == recordID {
			return true, nil
		}
	}
	return false, nil
}

func collectRecordValues(ctx contractapi.TransactionContextInterface, objectType string, batchID string) ([][]byte, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(objectType, []string{batchID})
	if err != nil {
		return nil, fmt.Errorf("failed to query %s records: %w", objectType, err)
	}
	defer iterator.Close()

	var values [][]byte
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to read next %s record: %w", objectType, err)
		}
		values = append(values, kv.GetValue())
	}
	return values, nil
}

// computeEffectiveInputDigest hashes every ingredient and production record
// currently on this batch, in the ledger's own deterministic key order.
// RecordVerdict compares this against the attestation's own claimed digest
// -- an attestation computed before a correction landed no longer matches
// the batch's current records, and is rejected rather than silently
// accepted against stale inputs (TRD §23.2, FRD-CHAIN-CONCURRENCY-001's
// same "consistent snapshot, not a mixed state" discipline applied to
// verdict recording specifically).
func computeEffectiveInputDigest(ctx contractapi.TransactionContextInterface, batchID string) (string, error) {
	ingredientValues, err := collectRecordValues(ctx, "ingredientRecord", batchID)
	if err != nil {
		return "", err
	}
	productionValues, err := collectRecordValues(ctx, "productionRecord", batchID)
	if err != nil {
		return "", err
	}

	h := sha256.New()
	for _, v := range ingredientValues {
		h.Write(v)
	}
	for _, v := range productionValues {
		h.Write(v)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// BatchTrail is the read path this module has lacked since P2
// (docs/04_trd.md §9 named CouchDB as the eventual read path; this is
// simpler and, for EffectiveInputDigest specifically, can't drift from
// RecordVerdict's own acceptance check the way an independent CouchDB
// query reimplementing the hash order could -- it calls the exact same
// computeEffectiveInputDigest used there). No field is ,omitempty/optional
// here: a fresh batch legitimately has zero production/verdict/export
// records, and every slice is always present as [] rather than omitted,
// so there's no contractapi schema-required gap to hit (the P2 incident,
// docs/14_developer_setup.md §1.3).
type BatchTrail struct {
	Batch                *Batch              `json:"batch" metadata:"batch"`
	IngredientRecords    []*IngredientRecord `json:"ingredient_records" metadata:"ingredient_records"`
	ProductionRecords    []*ProductionRecord `json:"production_records" metadata:"production_records"`
	VerdictRecords       []*VerdictRecord    `json:"verdict_records" metadata:"verdict_records"`
	ExportRecords        []*ExportRecord     `json:"export_records" metadata:"export_records"`
	EffectiveInputDigest string              `json:"effective_input_digest" metadata:"effective_input_digest"`
}

// GetBatchTrail returns everything recorded for a batch. No role
// restriction, matching every read function in refdata -- TRD §23.4 marks
// batch/trail data R for every operational role; a batch's own trail is
// what Screen Requirements' trail view and the verdict-attestation flow
// both need to read.
func (c *BatchContract) GetBatchTrail(ctx contractapi.TransactionContextInterface, batchID string) (*BatchTrail, error) {
	batch, err := requireBatchExists(ctx, batchID)
	if err != nil {
		return nil, err
	}

	ingredients, err := unmarshalRecords[IngredientRecord](ctx, "ingredientRecord", batchID)
	if err != nil {
		return nil, err
	}
	production, err := unmarshalRecords[ProductionRecord](ctx, "productionRecord", batchID)
	if err != nil {
		return nil, err
	}
	verdicts, err := unmarshalRecords[VerdictRecord](ctx, "verdictRecord", batchID)
	if err != nil {
		return nil, err
	}
	exports, err := unmarshalRecords[ExportRecord](ctx, "exportRecord", batchID)
	if err != nil {
		return nil, err
	}

	digest, err := computeEffectiveInputDigest(ctx, batchID)
	if err != nil {
		return nil, err
	}

	return &BatchTrail{
		Batch:                batch,
		IngredientRecords:    ingredients,
		ProductionRecords:    production,
		VerdictRecords:       verdicts,
		ExportRecords:        exports,
		EffectiveInputDigest: digest,
	}, nil
}

// unmarshalRecords is collectRecordValues plus typed unmarshaling, shared
// by GetBatchTrail's four record types.
func unmarshalRecords[T any](ctx contractapi.TransactionContextInterface, objectType string, batchID string) ([]*T, error) {
	values, err := collectRecordValues(ctx, objectType, batchID)
	if err != nil {
		return nil, err
	}
	records := make([]*T, 0, len(values))
	for _, v := range values {
		var r T
		if err := json.Unmarshal(v, &r); err != nil {
			return nil, fmt.Errorf("failed to unmarshal %s: %w", objectType, err)
		}
		records = append(records, &r)
	}
	return records, nil
}

// RecordIntegrity is one record's own stored bytes plus their hash, in the
// exact form computeEffectiveInputDigest hashed them (ADR-CT-034).
// StoredBytesBase64 is the value as it sits on the ledger, not a
// re-serialization of a decoded struct -- re-marshaling would drop fields
// this contract doesn't know about and quietly change the hash, which is
// the precise failure this type exists to make impossible.
//
// The bytes are safe to hand to any role: an ingredient or production record
// carries no admin-only fields (TRD §23.4 hides reference-entry metadata and
// supersession administration, neither of which appears here).
type RecordIntegrity struct {
	RecordID       string `json:"record_id" metadata:"record_id"`
	ObjectType     string `json:"object_type" metadata:"object_type"`
	Sha256         string `json:"sha256" metadata:"sha256"`
	StoredBytesB64 string `json:"stored_bytes_base64" metadata:"stored_bytes_base64"`
}

// BatchIntegrity is the raw material an independent verifier needs to
// recompute a batch's effective_input_digest itself, instead of trusting a
// boolean this module returns. Records are returned in digest order
// (ingredient records in ledger key order, then production records), which
// is the order DigestOrder states in words -- a verifier that hardcodes the
// wrong order gets a mismatch, not a false pass.
type BatchIntegrity struct {
	BatchID              string             `json:"batch_id" metadata:"batch_id"`
	Algorithm            string             `json:"algorithm" metadata:"algorithm"`
	DigestOrder          string             `json:"digest_order" metadata:"digest_order"`
	Records              []*RecordIntegrity `json:"records" metadata:"records"`
	EffectiveInputDigest string             `json:"effective_input_digest" metadata:"effective_input_digest"`
}

const (
	integrityAlgorithm   = "sha256"
	integrityDigestOrder = "ingredient records in ledger key order, then production records in ledger key order"
)

// GetBatchIntegrity returns every ingredient and production record's stored
// bytes and hash, plus the batch's own effective input digest, so that a
// caller -- including one that does not trust this backend -- can recompute
// the digest and see for itself whether they agree (ADR-CT-034, the PRD's
// "a reviewer can independently verify tamper-evidence"). No role
// restriction, matching GetBatchTrail: it exposes exactly the data the trail
// already exposes, in a form that can be hashed.
func (c *BatchContract) GetBatchIntegrity(ctx contractapi.TransactionContextInterface, batchID string) (*BatchIntegrity, error) {
	if _, err := requireBatchExists(ctx, batchID); err != nil {
		return nil, err
	}

	records := make([]*RecordIntegrity, 0)
	for _, objectType := range []string{"ingredientRecord", "productionRecord"} {
		values, err := collectRecordValues(ctx, objectType, batchID)
		if err != nil {
			return nil, err
		}
		for _, value := range values {
			var identified struct {
				RecordID string `json:"record_id"`
			}
			if err := json.Unmarshal(value, &identified); err != nil {
				return nil, fmt.Errorf("failed to unmarshal %s: %w", objectType, err)
			}
			sum := sha256.Sum256(value)
			records = append(records, &RecordIntegrity{
				RecordID:       identified.RecordID,
				ObjectType:     objectType,
				Sha256:         hex.EncodeToString(sum[:]),
				StoredBytesB64: base64.StdEncoding.EncodeToString(value),
			})
		}
	}

	digest, err := computeEffectiveInputDigest(ctx, batchID)
	if err != nil {
		return nil, err
	}

	return &BatchIntegrity{
		BatchID:              batchID,
		Algorithm:            integrityAlgorithm,
		DigestOrder:          integrityDigestOrder,
		Records:              records,
		EffectiveInputDigest: digest,
	}, nil
}

// GetAttestationPublicKey publishes the key every verdict attestation is
// verified against, so a third party can check a stored signature without
// holding this source tree (ADR-CT-034). It returns the same PEM the module
// compiles in -- the key is public by construction; only its private half
// lives outside this repository.
func (c *BatchContract) GetAttestationPublicKey(ctx contractapi.TransactionContextInterface) (string, error) {
	return verdictAttestationPublicKeyPEM, nil
}

// RecordVerdict records the compliance engine's binding Pass/Fail verdict
// (FRD-CHAIN-VERDICT-005). Compliance Officer only
// (FRD-CHAIN-ROLE-003). The engine's output is binding -- this function
// accepts no client-supplied verdict fields beyond a single signed
// attestation; every substantive field (status, regulation, fail reason,
// flagged record) comes from that attestation, verified against a public
// key compiled into this chaincode. There is no override parameter and
// never will be (FRD-CHAIN-VERDICT-006).
func (c *BatchContract) RecordVerdict(
	ctx contractapi.TransactionContextInterface,
	attestationJSON string,
	signatureBase64 string,
) (*VerdictRecord, error) {
	if err := requireRole(ctx, "compliance_officer"); err != nil {
		return nil, err
	}

	if err := verifyAttestationSignature([]byte(attestationJSON), signatureBase64); err != nil {
		return nil, err
	}

	var att VerdictAttestation
	if err := json.Unmarshal([]byte(attestationJSON), &att); err != nil {
		return nil, fmt.Errorf("failed to unmarshal attestation: %w", err)
	}

	if att.Result != "pass" && att.Result != "fail" {
		return nil, fmt.Errorf("attestation_invalid: result must be \"pass\" or \"fail\", got %q", att.Result)
	}

	bKey, err := batchKey(ctx, att.BatchID)
	if err != nil {
		return nil, fmt.Errorf("failed to build batch key: %w", err)
	}
	batchBytes, err := ctx.GetStub().GetState(bKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if batchBytes == nil {
		return nil, fmt.Errorf("batch_not_found: batch %q does not exist", att.BatchID)
	}
	var batch Batch
	if err := json.Unmarshal(batchBytes, &batch); err != nil {
		return nil, fmt.Errorf("failed to unmarshal batch: %w", err)
	}
	if string(batch.IntendedMarket) != att.IntendedMarket {
		return nil, fmt.Errorf(
			"attestation_invalid: attestation intended_market %q does not match batch's %q",
			att.IntendedMarket, batch.IntendedMarket,
		)
	}

	hasProduction, err := c.hasAnyRecord(ctx, "productionRecord", att.BatchID)
	if err != nil {
		return nil, err
	}
	if !hasProduction {
		return nil, fmt.Errorf("sequencing_violation: batch %q has no production record yet", att.BatchID)
	}

	actualDigest, err := computeEffectiveInputDigest(ctx, att.BatchID)
	if err != nil {
		return nil, err
	}
	if actualDigest != att.InputDigest {
		return nil, fmt.Errorf("attestation_invalid: input digest does not match this batch's current records -- attestation is stale")
	}

	regulationRef, err := c.resolveReference(ctx, "standard", att.RegulationValue)
	if err != nil {
		return nil, err
	}

	record := VerdictRecord{
		RecordID:                   ctx.GetStub().GetTxID(),
		BatchID:                    att.BatchID,
		Status:                     att.Result,
		RegulationSnapshot:         regulationRef.Value,
		RegulationReferenceEntryID: regulationRef.EntryID,
		RegulationReferenceVersion: regulationRef.Version,
		EngineAttestationDigest:    att.InputDigest,
		EngineAttestation:          attestationJSON,
		EngineAttestationSignature: signatureBase64,
		EngineVersion:              att.EngineVersion,
		RulesRelease:               att.RulesRelease,
		RecognitionCheck:           att.RecognitionCheck,
	}

	if att.Result == "fail" {
		if att.FailReason == "" {
			return nil, fmt.Errorf("attestation_invalid: a fail result requires fail_reason")
		}
		if att.FlaggedRecordID == "" {
			return nil, fmt.Errorf("attestation_invalid: a fail result requires flagged_record_id")
		}

		flagExists, err := c.recordExists(ctx, att.BatchID, att.FlaggedRecordID)
		if err != nil {
			return nil, err
		}
		if !flagExists {
			return nil, fmt.Errorf(
				"attestation_invalid: flagged_record_id %q does not reference an existing record on this batch",
				att.FlaggedRecordID,
			)
		}

		failReasonRef, err := c.resolveReference(ctx, "fail_reason", att.FailReason)
		if err != nil {
			return nil, err
		}

		record.FailReasonSnapshot = failReasonRef.Value
		record.FailReasonReferenceEntryID = failReasonRef.EntryID
		record.FailReasonReferenceVersion = failReasonRef.Version
		record.FlaggedRecordID = att.FlaggedRecordID
	}

	submittedBy, err := cid.GetID(ctx.GetStub())
	if err != nil {
		return nil, fmt.Errorf("failed to resolve caller identity: %w", err)
	}
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to read transaction timestamp: %w", err)
	}
	record.Timestamp = time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC().Format(time.RFC3339)
	record.SubmittedBy = submittedBy

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal verdict record: %w", err)
	}

	key, err := verdictRecordKey(ctx, att.BatchID, record.RecordID)
	if err != nil {
		return nil, fmt.Errorf("failed to build verdict record key: %w", err)
	}
	if err := ctx.GetStub().PutState(key, recordJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	// Update the latest-verdict pointer -- see latestVerdictPointerKey's
	// comment for why this exists. This is the same narrowly-scoped,
	// single-purpose overwrite pattern refdata's DeprecateReferenceEntry
	// uses: a new fact about "what's current," never a rewrite of a past
	// verdict record itself (verdictRecordKey above is only ever written
	// once, matching every other append-only key in this module).
	pointerKey, err := latestVerdictPointerKey(ctx, att.BatchID)
	if err != nil {
		return nil, fmt.Errorf("failed to build latest verdict pointer key: %w", err)
	}
	if err := ctx.GetStub().PutState(pointerKey, recordJSON); err != nil {
		return nil, fmt.Errorf("failed to write latest verdict pointer: %w", err)
	}

	return &record, nil
}

// ExportRecord mirrors docs/06_erd.md's EXPORT_RECORD. No correction mode
// exists for this record type at all (not even a deferred one) -- nothing
// in the FRD/ERD describes correcting an export.
type ExportRecord struct {
	RecordID          string `json:"record_id" metadata:"record_id"`
	BatchID           string `json:"batch_id" metadata:"batch_id"`
	DestinationMarket string `json:"destination_market" metadata:"destination_market"`
	Timestamp         string `json:"timestamp" metadata:"timestamp"`
	SubmittedBy       string `json:"submitted_by" metadata:"submitted_by"`
}

func exportRecordKey(ctx contractapi.TransactionContextInterface, batchID string, recordID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey("exportRecord", []string{batchID, recordID})
}

// RequestExport records an export release request for a batch
// (FRD-CHAIN-SEQUENCE-003, PRD-CT-004). Export/Logistics Officer only
// (FRD-CHAIN-ROLE-004). DestinationMarket is copied from the batch's own
// immutable IntendedMarket -- there is no parameter for it at all, so a
// caller cannot supply a different destination even if they tried
// (API Reference §8: "clients must not submit a destination market at
// export time").
//
// Blocked, at the chaincode level, unless the CURRENT (latest, via
// latestVerdictPointerKey) verdict is Pass -- not just any Pass ever
// recorded. A batch that failed after an earlier Pass (a re-verdict
// scenario following a correction) is blocked again, matching "the latest
// effective verdict" language used throughout TRD §23.5. A batch already
// exported once is rejected on a second attempt -- export is a one-way,
// one-time transition, the same discipline as ConfirmProduction's
// duplicate-rejection above.
func (c *BatchContract) RequestExport(
	ctx contractapi.TransactionContextInterface,
	batchID string,
) (*ExportRecord, error) {
	if err := requireRole(ctx, "export_officer"); err != nil {
		return nil, err
	}

	bKey, err := batchKey(ctx, batchID)
	if err != nil {
		return nil, fmt.Errorf("failed to build batch key: %w", err)
	}
	batchBytes, err := ctx.GetStub().GetState(bKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if batchBytes == nil {
		return nil, fmt.Errorf("batch_not_found: batch %q does not exist", batchID)
	}
	var batch Batch
	if err := json.Unmarshal(batchBytes, &batch); err != nil {
		return nil, fmt.Errorf("failed to unmarshal batch: %w", err)
	}

	pointerKey, err := latestVerdictPointerKey(ctx, batchID)
	if err != nil {
		return nil, fmt.Errorf("failed to build latest verdict pointer key: %w", err)
	}
	latestVerdictBytes, err := ctx.GetStub().GetState(pointerKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %w", err)
	}
	if latestVerdictBytes == nil {
		return nil, fmt.Errorf("no_valid_verdict: batch %q has no recorded verdict", batchID)
	}
	var latestVerdict VerdictRecord
	if err := json.Unmarshal(latestVerdictBytes, &latestVerdict); err != nil {
		return nil, fmt.Errorf("failed to unmarshal latest verdict: %w", err)
	}
	if latestVerdict.Status != "pass" {
		return nil, fmt.Errorf(
			"no_valid_verdict: batch %q's current verdict is %q, not pass",
			batchID, latestVerdict.Status,
		)
	}

	hasExport, err := c.hasAnyRecord(ctx, "exportRecord", batchID)
	if err != nil {
		return nil, err
	}
	if hasExport {
		return nil, fmt.Errorf("duplicate_entry: batch %q has already been exported", batchID)
	}

	submittedBy, err := cid.GetID(ctx.GetStub())
	if err != nil {
		return nil, fmt.Errorf("failed to resolve caller identity: %w", err)
	}
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to read transaction timestamp: %w", err)
	}

	record := ExportRecord{
		RecordID:          ctx.GetStub().GetTxID(),
		BatchID:           batchID,
		DestinationMarket: string(batch.IntendedMarket),
		Timestamp:         time.Unix(txTimestamp.GetSeconds(), int64(txTimestamp.GetNanos())).UTC().Format(time.RFC3339),
		SubmittedBy:       submittedBy,
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal export record: %w", err)
	}

	key, err := exportRecordKey(ctx, batchID, record.RecordID)
	if err != nil {
		return nil, fmt.Errorf("failed to build export record key: %w", err)
	}
	if err := ctx.GetStub().PutState(key, recordJSON); err != nil {
		return nil, fmt.Errorf("failed to write to world state: %w", err)
	}

	return &record, nil
}

func main() {
	chaincode, err := contractapi.NewChaincode(&BatchContract{})
	if err != nil {
		panic(fmt.Sprintf("Error creating batch chaincode: %v", err))
	}
	if err := chaincode.Start(); err != nil {
		panic(fmt.Sprintf("Error starting batch chaincode: %v", err))
	}
}
