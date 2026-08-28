// Loads each demo identity's real enrolled cert/key from the Fabric CA
// material on disk -- never generated or held in this repo (network/README.md:
// "Do not commit generated identity material... only templates and reviewed
// configuration files belong in version control"). FABRIC_MSP_ROOT points at
// the fabric-samples checkout's organizations/peerOrganizations/<org>/users
// directory (docs/14_developer_setup.md §1.2 -- outside this repo entirely).
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Identity, Signer } from "@hyperledger/fabric-gateway";
import { signers } from "@hyperledger/fabric-gateway";
import * as crypto from "node:crypto";

const MSP_ROOT = process.env.FABRIC_MSP_ROOT;
const MSP_ID = process.env.FABRIC_MSP_ID ?? "Org1MSP";

if (!MSP_ROOT) {
  throw new Error("FABRIC_MSP_ROOT must be set (path to organizations/peerOrganizations/<org>/users)");
}

// users.fabric_identity (db/init/001_schema.sql) stores the bare label,
// e.g. "ingredient-qa" -- the on-disk directory is that label plus the
// fixed "@org1.example.com" suffix every identity in this network shares.
function identityDir(fabricIdentity: string): string {
  return join(MSP_ROOT!, `${fabricIdentity}@org1.example.com`, "msp");
}

async function loadCertificate(fabricIdentity: string): Promise<Buffer> {
  const path = join(identityDir(fabricIdentity), "signcerts", "cert.pem");
  return readFile(path);
}

// The private key file's name is a content hash, not a fixed name (Fabric
// CA convention) -- the keystore directory always holds exactly one file
// per identity, so listing it is the correct, only way to find it.
async function loadPrivateKeyPath(fabricIdentity: string): Promise<string> {
  const keystoreDir = join(identityDir(fabricIdentity), "keystore");
  const files = await readdir(keystoreDir);
  if (files.length !== 1) {
    throw new Error(`expected exactly one key file in ${keystoreDir}, found ${files.length}`);
  }
  return join(keystoreDir, files[0]);
}

export async function loadIdentity(fabricIdentity: string): Promise<Identity> {
  const credentials = await loadCertificate(fabricIdentity);
  return { mspId: MSP_ID, credentials };
}

export async function loadSigner(fabricIdentity: string): Promise<Signer> {
  const keyPath = await loadPrivateKeyPath(fabricIdentity);
  const privateKeyPem = await readFile(keyPath);
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}
