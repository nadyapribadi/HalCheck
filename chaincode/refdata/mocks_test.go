// Hand-written test doubles, not code-generated. Each embeds the real
// interface (nil) and overrides only the methods this module's tests
// actually exercise -- any unoverridden method would panic if called,
// which is a deliberate signal that a test reached further than expected
// rather than silently returning zero values.
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/attrmgr"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"github.com/hyperledger/fabric-protos-go-apiv2/ledger/queryresult"
	"github.com/hyperledger/fabric-protos-go-apiv2/msp"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type mockChaincodeStub struct {
	shim.ChaincodeStubInterface
	creator []byte
	state   map[string][]byte
	// history records every PutState call per key, oldest first -- backs
	// GetHistoryForKey the same way a real peer's block history would.
	history map[string][]*queryresult.KeyModification
	txID    string
}

func newMockChaincodeStub(creator []byte) *mockChaincodeStub {
	return &mockChaincodeStub{
		creator: creator,
		state:   map[string][]byte{},
		history: map[string][]*queryresult.KeyModification{},
		txID:    "test-tx-id",
	}
}

func (m *mockChaincodeStub) GetCreator() ([]byte, error) { return m.creator, nil }

func (m *mockChaincodeStub) GetState(key string) ([]byte, error) { return m.state[key], nil }

func (m *mockChaincodeStub) PutState(key string, value []byte) error {
	m.state[key] = value
	m.history[key] = append(m.history[key], &queryresult.KeyModification{
		TxId:      m.txID,
		Value:     value,
		Timestamp: timestamppb.New(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		IsDelete:  false,
	})
	return nil
}

func (m *mockChaincodeStub) GetTxID() string { return m.txID }

func (m *mockChaincodeStub) GetTxTimestamp() (*timestamppb.Timestamp, error) {
	return timestamppb.New(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)), nil
}

func (m *mockChaincodeStub) CreateCompositeKey(objectType string, attributes []string) (string, error) {
	return shim.CreateCompositeKey(objectType, attributes)
}

func (m *mockChaincodeStub) GetHistoryForKey(key string) (shim.HistoryQueryIteratorInterface, error) {
	return &mockHistoryIterator{items: m.history[key]}, nil
}

// GetStateByPartialCompositeKey matches every stored key whose composite
// encoding starts with objectType+attributes -- the real semantics
// (CreateCompositeKey's prefix IS the partial-key query string; that's
// exactly how Fabric implements this against CouchDB/LevelDB range scans
// too). Results are sorted by key for deterministic test assertions --
// real Fabric doesn't guarantee an order, but a mock returning random Go
// map iteration order would make every caller's test flaky for no reason.
func (m *mockChaincodeStub) GetStateByPartialCompositeKey(objectType string, attributes []string) (shim.StateQueryIteratorInterface, error) {
	prefix, err := shim.CreateCompositeKey(objectType, attributes)
	if err != nil {
		return nil, err
	}

	var matched []*queryresult.KV
	for key, value := range m.state {
		if strings.HasPrefix(key, prefix) {
			matched = append(matched, &queryresult.KV{Key: key, Value: value})
		}
	}
	sort.Slice(matched, func(i, j int) bool { return matched[i].Key < matched[j].Key })

	return &mockStateQueryIterator{items: matched}, nil
}

// mockHistoryIterator implements shim.HistoryQueryIteratorInterface over an
// in-memory slice -- GetHistoryForKey's real return type, just backed by
// the mock stub's own recorded history instead of a peer's block store.
type mockHistoryIterator struct {
	items []*queryresult.KeyModification
	pos   int
}

func (it *mockHistoryIterator) HasNext() bool { return it.pos < len(it.items) }

func (it *mockHistoryIterator) Close() error { return nil }

func (it *mockHistoryIterator) Next() (*queryresult.KeyModification, error) {
	item := it.items[it.pos]
	it.pos++
	return item, nil
}

// mockStateQueryIterator implements shim.StateQueryIteratorInterface over
// an in-memory slice -- GetStateByPartialCompositeKey's real return type.
type mockStateQueryIterator struct {
	items []*queryresult.KV
	pos   int
}

func (it *mockStateQueryIterator) HasNext() bool { return it.pos < len(it.items) }

func (it *mockStateQueryIterator) Close() error { return nil }

func (it *mockStateQueryIterator) Next() (*queryresult.KV, error) {
	item := it.items[it.pos]
	it.pos++
	return item, nil
}

type mockTransactionContext struct {
	contractapi.TransactionContextInterface
	stub *mockChaincodeStub
}

func (m *mockTransactionContext) GetStub() shim.ChaincodeStubInterface { return m.stub }

// identityCreatorBytes builds the marshaled msp.SerializedIdentity bytes a
// real ChaincodeStub.GetCreator() would return for an identity whose
// signing certificate carries the given role attribute -- no committed
// crypto material, no dependency on a running network. Uses the real
// attrmgr/cid machinery, so this exercises exactly the same code path a
// genuine Fabric-CA-issued certificate would.
func identityCreatorBytes(t *testing.T, mspID, role string) []byte {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate test key: %v", err)
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: role + "@test.example.com"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}

	if role != "" {
		attrs := &attrmgr.Attributes{Attrs: map[string]string{"role": role}}
		if err := attrmgr.New().AddAttributesToCert(attrs, template); err != nil {
			t.Fatalf("failed to add role attribute to test cert: %v", err)
		}
		// AddAttributesToCert appends to Extensions, which x509.CreateCertificate
		// ignores -- that field is populated only when *parsing* a certificate.
		// ExtraExtensions is what actually gets embedded when creating one.
		template.ExtraExtensions = template.Extensions
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("failed to create test certificate: %v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})

	sid := &msp.SerializedIdentity{Mspid: mspID, IdBytes: certPEM}
	creator, err := proto.Marshal(sid)
	if err != nil {
		t.Fatalf("failed to marshal test identity: %v", err)
	}
	return creator
}

// newIdentityContext builds a fresh transaction context (fresh ledger state)
// for a single-identity test.
func newIdentityContext(t *testing.T, mspID, role string) *mockTransactionContext {
	t.Helper()
	return &mockTransactionContext{stub: newMockChaincodeStub(identityCreatorBytes(t, mspID, role))}
}

// actingAs returns a new transaction context bound to the SAME underlying
// ledger state as ctx, but signed by a different role. Use this whenever a
// test needs "this exact state, attempted by the wrong identity" rather than
// "an empty ledger, attempted by the wrong identity" -- the latter can pass
// for the wrong reason (not-found vs. role rejection look identical from a
// bare success/failure check).
func (ctx *mockTransactionContext) actingAs(t *testing.T, mspID, role string) *mockTransactionContext {
	t.Helper()
	return &mockTransactionContext{stub: &mockChaincodeStub{
		creator: identityCreatorBytes(t, mspID, role),
		state:   ctx.stub.state,
		history: ctx.stub.history,
		txID:    ctx.stub.txID,
	}}
}
