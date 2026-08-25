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
	"encoding/json"
	"encoding/pem"
	"fmt"
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
	"github.com/hyperledger/fabric-protos-go-apiv2/peer"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type mockChaincodeStub struct {
	shim.ChaincodeStubInterface
	creator []byte
	state   map[string][]byte
	txID    string
	// invokeResponses lets a test script exactly what a cross-chaincode
	// InvokeChaincode call should return, keyed by chaincode+function+args.
	// Unit tests intentionally isolate batch from refdata's real logic
	// (docs/07_test_strategy.md §2, "Unit Tests ... isolated from network");
	// the real cross-chaincode path is proven by deploying both modules to
	// the live network, not by this mock.
	invokeResponses map[string]*peer.Response
}

func newMockChaincodeStub(creator []byte) *mockChaincodeStub {
	return &mockChaincodeStub{
		creator:         creator,
		state:           map[string][]byte{},
		txID:            "test-tx-id",
		invokeResponses: map[string]*peer.Response{},
	}
}

func (m *mockChaincodeStub) GetCreator() ([]byte, error) { return m.creator, nil }

func (m *mockChaincodeStub) GetState(key string) ([]byte, error) { return m.state[key], nil }

func (m *mockChaincodeStub) PutState(key string, value []byte) error {
	m.state[key] = value
	return nil
}

func (m *mockChaincodeStub) GetTxID() string { return m.txID }

func (m *mockChaincodeStub) GetChannelID() string { return "test-channel" }

func (m *mockChaincodeStub) GetTxTimestamp() (*timestamppb.Timestamp, error) {
	return timestamppb.New(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)), nil
}

func (m *mockChaincodeStub) CreateCompositeKey(objectType string, attributes []string) (string, error) {
	return shim.CreateCompositeKey(objectType, attributes)
}

// GetStateByPartialCompositeKey matches every stored key whose composite
// encoding starts with objectType+attributes -- the real semantics
// (CreateCompositeKey's prefix IS the partial-key query string). Results
// are sorted by key for deterministic test assertions.
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

func (m *mockChaincodeStub) InvokeChaincode(chaincodeName string, args [][]byte, channel string) *peer.Response {
	key := invokeKey(chaincodeName, args)
	if resp, ok := m.invokeResponses[key]; ok {
		return resp
	}
	return &peer.Response{Status: 500, Message: fmt.Sprintf("no mock InvokeChaincode response configured for %s", key)}
}

func invokeKey(chaincodeName string, args [][]byte) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, chaincodeName)
	for _, a := range args {
		parts = append(parts, string(a))
	}
	return strings.Join(parts, "|")
}

// stubResolveActiveReference configures a successful mock response for
// refdata.ResolveActiveReference(entryType, value), shaped exactly like
// refdata's real ReferenceEntry JSON (chaincode/refdata/refdata.go).
func stubResolveActiveReference(stub *mockChaincodeStub, entryType, value, entryID, version, metadata string) {
	payload, err := json.Marshal(map[string]string{
		"entry_id": entryID,
		"type":     entryType,
		"value":    value,
		"version":  version,
		"status":   "active",
		"metadata": metadata,
	})
	if err != nil {
		panic(err) // test setup only -- a marshal failure here is a test bug, not a runtime case
	}
	key := invokeKey("refdata", [][]byte{[]byte("ResolveActiveReference"), []byte(entryType), []byte(value)})
	stub.invokeResponses[key] = &peer.Response{Status: 200, Payload: payload}
}

// stubResolveActiveReferenceRejected configures the mock response
// refdata.ResolveActiveReference actually returns for an unrecognized or
// deprecated value -- the exact reason-coded message batch is expected to
// propagate unchanged.
func stubResolveActiveReferenceRejected(stub *mockChaincodeStub, entryType, value string) {
	key := invokeKey("refdata", [][]byte{[]byte("ResolveActiveReference"), []byte(entryType), []byte(value)})
	stub.invokeResponses[key] = &peer.Response{
		Status:  500,
		Message: fmt.Sprintf("not_a_recognized_value: no %s entry with value %q exists", entryType, value),
	}
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
		creator:         identityCreatorBytes(t, mspID, role),
		state:           ctx.stub.state,
		invokeResponses: ctx.stub.invokeResponses,
		txID:            ctx.stub.txID,
	}}
}

// withTestAttestationKey swaps the package-level verdictAttestationPublicKey
// for a freshly-generated test keypair for the duration of a single test,
// restoring the real (compiled-in) key afterward via t.Cleanup. This is
// what lets tests exercise RecordVerdict's actual signature-verification
// logic without ever touching the real private key, which -- correctly --
// isn't in this repository at all (see batch.go's comment on the const).
func withTestAttestationKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate test attestation key: %v", err)
	}
	original := verdictAttestationPublicKey
	verdictAttestationPublicKey = &priv.PublicKey
	t.Cleanup(func() { verdictAttestationPublicKey = original })
	return priv
}
