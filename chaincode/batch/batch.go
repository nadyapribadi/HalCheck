// Package main implements the batch chaincode module: the batch lifecycle
// (ingredient sourcing -> production -> compliance verdict -> export),
// role-scoped and sequenced, append-only. See docs/04_trd.md §7,
// docs/06_erd.md BATCH, and docs/18_vibe_coding_guardrails.md §3 for the
// rules this module must hold to.
package main

import (
	"encoding/json"
	"fmt"
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

// IngredientRecord mirrors docs/06_erd.md's INGREDIENT_RECORD. This first
// version covers plain submission only -- correction mode
// (supersedes_record_id actually set, per FRD-CHAIN-LEDGER-005/TRD §23.5's
// distinct role/state rules) is deliberately a separate follow-up function,
// not conflated into this one.
type IngredientRecord struct {
	RecordID                   string `json:"record_id"`
	BatchID                    string `json:"batch_id"`
	UploadSessionID            string `json:"upload_session_id,omitempty"`
	IngredientNameSnapshot     string `json:"ingredient_name_snapshot"`
	IngredientReferenceEntryID string `json:"ingredient_reference_entry_id"`
	IngredientReferenceVersion string `json:"ingredient_reference_version"`
	SourceSnapshot             string `json:"source_snapshot"`
	SupplierReferenceEntryID   string `json:"supplier_reference_entry_id"`
	SupplierReferenceVersion   string `json:"supplier_reference_version"`
	HalalRiskFlag              bool   `json:"halal_risk_flag"`
	OverrideReason             string `json:"override_reason,omitempty"`
	SupersedesRecordID         string `json:"supersedes_record_id,omitempty"`
	Timestamp                  string `json:"timestamp"`
	SubmittedBy                string `json:"submitted_by"`
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
) (*IngredientRecord, error) {
	if err := requireRole(ctx, "ingredient_qa"); err != nil {
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
		HalalRiskFlag:              halalRiskFlag,
		OverrideReason:             recordedOverrideReason,
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

func main() {
	chaincode, err := contractapi.NewChaincode(&BatchContract{})
	if err != nil {
		panic(fmt.Sprintf("Error creating batch chaincode: %v", err))
	}
	if err := chaincode.Start(); err != nil {
		panic(fmt.Sprintf("Error starting batch chaincode: %v", err))
	}
}
