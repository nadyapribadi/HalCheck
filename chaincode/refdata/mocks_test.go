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
	"testing"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/attrmgr"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"github.com/hyperledger/fabric-protos-go-apiv2/msp"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type mockChaincodeStub struct {
	shim.ChaincodeStubInterface
	creator []byte
	state   map[string][]byte
	txID    string
}

func newMockChaincodeStub(creator []byte) *mockChaincodeStub {
	return &mockChaincodeStub{creator: creator, state: map[string][]byte{}, txID: "test-tx-id"}
}

func (m *mockChaincodeStub) GetCreator() ([]byte, error) { return m.creator, nil }

func (m *mockChaincodeStub) GetState(key string) ([]byte, error) { return m.state[key], nil }

func (m *mockChaincodeStub) PutState(key string, value []byte) error {
	m.state[key] = value
	return nil
}

func (m *mockChaincodeStub) GetTxID() string { return m.txID }

func (m *mockChaincodeStub) GetTxTimestamp() (*timestamppb.Timestamp, error) {
	return timestamppb.New(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)), nil
}

func (m *mockChaincodeStub) CreateCompositeKey(objectType string, attributes []string) (string, error) {
	return shim.CreateCompositeKey(objectType, attributes)
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
		txID:    ctx.stub.txID,
	}}
}
