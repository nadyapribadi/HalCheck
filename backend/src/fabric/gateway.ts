// The one shared entry point for every chaincode call this backend makes.
// TRD §8's constraints live here, in one place, not scattered per-route:
// - "REST API... functioning strictly as a translation layer" -- this file
//   holds no business logic, only connection/timeout/error-shape mechanics.
// - "SDK call timeout: all Fabric Gateway SDK calls wrapped with an
//   explicit 10-second timeout... reason: 'ledger_unavailable'."
// - "Concurrency conflict translation: MVCC_READ_CONFLICT -> reason:
//   'concurrent_modification', HTTP 409."
import * as grpc from "@grpc/grpc-js";
import { connect, hash, StatusCode, type Contract, type Gateway } from "@hyperledger/fabric-gateway";
import { readFile } from "node:fs/promises";
import { loadIdentity, loadSigner } from "./identities.js";

const PEER_ENDPOINT = requireEnv("FABRIC_PEER_ENDPOINT");
const PEER_TLS_CERT_PATH = requireEnv("FABRIC_PEER_TLS_CERT_PATH");
const PEER_HOST_ALIAS = requireEnv("FABRIC_PEER_HOST_ALIAS");
const CHANNEL_NAME = requireEnv("FABRIC_CHANNEL_NAME");
const BATCH_CHAINCODE_NAME = process.env.FABRIC_BATCH_CHAINCODE_NAME ?? "batch";
const REFDATA_CHAINCODE_NAME = process.env.FABRIC_REFDATA_CHAINCODE_NAME ?? "refdata";
const SDK_TIMEOUT_MS = Number(process.env.SDK_TIMEOUT_MS ?? 10000);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

let sharedClient: grpc.Client | undefined;

// One gRPC/TLS connection to the peer, reused across every request and
// every identity -- identity and signing happen per-call in connectAs(),
// not here. Building this is the expensive part; connectAs() is cheap.
async function getSharedClient(): Promise<grpc.Client> {
  if (sharedClient) return sharedClient;
  const tlsRootCert = await readFile(PEER_TLS_CERT_PATH);
  const credentials = grpc.credentials.createSsl(tlsRootCert);
  sharedClient = new grpc.Client(PEER_ENDPOINT, credentials, {
    "grpc.ssl_target_name_override": PEER_HOST_ALIAS,
  });
  return sharedClient;
}

export type ChaincodeName = "batch" | "refdata";

// reason-coded error thrown to callers -- routes translate this into the
// matching HTTP status/reason without needing to know anything about gRPC
// or the Gateway SDK's own error shapes.
export class ChaincodeCallError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ChaincodeCallError";
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ChaincodeCallError("ledger call timed out", "ledger_unavailable", 503));
    }, SDK_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(translateError(err));
      },
    );
  });
}

// Extracts the chaincode's own reason-coded message (e.g.
// "role_scope_violation: caller is not ingredient_qa") from the Gateway
// SDK's error shapes, and maps infrastructure/concurrency failures to the
// reason codes TRD §8 specifies. The exact class names/fields here
// (EndorseError.details[].message, CommitError.code) are verified against
// the real local network, not just SDK documentation -- see
// docs/14_developer_setup.md §2.x for the live proof this was checked
// against, since the Gateway SDK's own docs don't fully spell out the
// TypeScript error shapes.
function translateError(err: unknown): ChaincodeCallError {
  if (err instanceof ChaincodeCallError) return err;

  const anyErr = err as {
    code?: number;
    details?: Array<{ message?: string }>;
    message?: string;
    name?: string;
  };

  // gRPC UNAVAILABLE (14) / DEADLINE_EXCEEDED (4): the peer/orderer itself
  // was unreachable, not a chaincode rejection.
  if (anyErr.code === 14 || anyErr.code === 4) {
    return new ChaincodeCallError("ledger unavailable", "ledger_unavailable", 503);
  }

  // Endorsement-time rejection: the chaincode's own reason-coded message
  // lives in details[].message, prefixed "chaincode response 500, ".
  const detailMessage = anyErr.details?.[0]?.message;
  if (detailMessage) {
    const stripped = detailMessage.replace(/^chaincode response \d+,\s*/, "");
    const reason = stripped.split(":")[0]?.trim();
    if (reason && /^[a-z_]+$/.test(reason)) {
      return new ChaincodeCallError(stripped, reason, reasonToHttpStatus(reason));
    }
    return new ChaincodeCallError(stripped, "chaincode_error", 500);
  }

  // Commit-time (post-ordering) validation failure -- MVCC/phantom-read
  // conflicts surface here, not at endorsement, since both endorsing peers
  // simulate independently and only see the conflict once the block is
  // validated (proven live, docs/14_developer_setup.md §1.8).
  const message = anyErr.message ?? String(err);
  if (message.includes("MVCC_READ_CONFLICT") || message.includes("PHANTOM_READ_CONFLICT")) {
    return new ChaincodeCallError("concurrent modification detected", "concurrent_modification", 409);
  }

  return new ChaincodeCallError(message, "unknown_error", 500);
}

function reasonToHttpStatus(reason: string): number {
  switch (reason) {
    case "role_scope_violation":
      return 403;
    case "batch_not_found":
    case "not_a_recognized_value":
      return 404;
    case "duplicate_entry":
    case "already_deprecated":
    case "sequencing_violation":
    case "invalid_entry_type":
    case "invalid_market":
    case "missing_field":
    case "attestation_invalid":
      return 400;
    default:
      return 500;
  }
}

interface ConnectedGateway {
  gateway: Gateway;
  batch: Contract;
  refdata: Contract;
  close: () => void;
}

// Connects as a specific demo identity (users.fabric_identity) and returns
// both chaincodes' contracts on the one channel. Callers should call
// close() when done with this request -- cheap to open fresh per request
// since the shared gRPC client already holds the expensive TLS connection.
export async function connectAs(fabricIdentity: string): Promise<ConnectedGateway> {
  const client = await getSharedClient();
  const identity = await loadIdentity(fabricIdentity);
  const signer = await loadSigner(fabricIdentity);

  const gateway = connect({ client, identity, signer, hash: hash.sha256 });
  const network = gateway.getNetwork(CHANNEL_NAME);

  return {
    gateway,
    batch: network.getContract(BATCH_CHAINCODE_NAME),
    refdata: network.getContract(REFDATA_CHAINCODE_NAME),
    close: () => gateway.close(),
  };
}

export interface SubmitResult {
  result: Uint8Array;
  txId: string;
}

// Uses the fine-grained endorse/submit/status flow (not the
// contract.submitTransaction() convenience method) purely to capture
// getTransactionId() -- docs/17_api_reference.md's response examples
// include a ledger txId, which submitTransaction()'s Uint8Array-only
// return can't provide. Commit-failure handling mirrors what
// submitTransaction() does internally (ContractImpl.submit in the SDK):
// a non-successful status is a real failure, translated the same way
// MVCC/PHANTOM_READ_CONFLICT already is (docs/14_developer_setup.md §1.8).
async function submitAndCapture(contract: Contract, fn: string, args: string[]): Promise<SubmitResult> {
  const proposal = contract.newProposal(fn, { arguments: args });
  const transaction = await proposal.endorse();
  const commit = await transaction.submit();
  const result = transaction.getResult();
  const status = await commit.getStatus();

  if (!status.successful) {
    if (status.code === StatusCode.MVCC_READ_CONFLICT || status.code === StatusCode.PHANTOM_READ_CONFLICT) {
      throw new ChaincodeCallError("concurrent modification detected", "concurrent_modification", 409);
    }
    throw new ChaincodeCallError(`transaction failed to commit with status code ${status.code}`, "chaincode_error", 500);
  }

  return { result, txId: transaction.getTransactionId() };
}

export async function submit(contract: Contract, fn: string, ...args: string[]): Promise<SubmitResult> {
  return withTimeout(submitAndCapture(contract, fn, args));
}

export async function evaluate(contract: Contract, fn: string, ...args: string[]): Promise<Uint8Array> {
  return withTimeout(contract.evaluateTransaction(fn, ...args));
}
