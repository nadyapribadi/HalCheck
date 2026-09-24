#!/usr/bin/env bash
# Bring the whole Compliance Trail up on a fresh machine.
#
# Why this script has to exist: the screening app is static, but the trail
# needs a Hyperledger Fabric network, six CA-issued role identities, two
# chaincode modules deployed through the formal lifecycle, an attestation
# keypair, Postgres, MinIO and two Node apps. None of that generated material
# may be committed (docs/19's hygiene rule), so a clone has to reproduce it.
#
#   ./scripts/bootstrap-demo.sh --check    # report only, change nothing
#   ./scripts/bootstrap-demo.sh            # do it, phase by phase
#
# Every phase is idempotent: an existing network, identity or committed
# chaincode makes it print "skip" and move on. Nothing outside $FABRIC_DIR and
# this repository is touched.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_DIR="${HALCHECK_FABRIC_DIR:-$HOME/fabric-samples-halcheck-p0}"
# Pinned deliberately: docs/14 §1.1 records this commit as the one everything
# below was proven against.
FABRIC_SAMPLES_REF="${HALCHECK_FABRIC_SAMPLES_REF:-05edea0}"
CHANNEL="compliancetrail"
CA_ORG1_URL="https://localhost:7054"
CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

ROLES=(ingredient-qa production-qa compliance-officer export-officer brand-owner system-admin)
ROLE_ATTRS=(ingredient_qa production_qa compliance_officer export_officer brand_owner system_admin)

ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; }
skip() { printf '  \033[36mskip\033[0m  %s\n' "$1"; }
warn() { printf '  \033[33mmanual\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; }
phase() { printf '\n\033[1m%s\033[0m\n' "$1"; }

need() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- phase 0 ---
phase "0. Prerequisites"
missing=0
for tool in docker node npm go; do
  if need "$tool"; then ok "$tool ($($tool --version 2>&1 | head -1))"; else bad "$tool is not installed"; missing=1; fi
done
if docker info >/dev/null 2>&1; then ok "docker daemon reachable"; else bad "docker daemon is not running"; missing=1; fi
if need cloudflared; then ok "cloudflared (optional, for a public demo URL)"; else warn "cloudflared not installed — optional, only needed to share the app"; fi
if [[ $missing -eq 1 ]]; then
  printf '\nInstall the missing tools first (docs/14 §3).\n'
  exit 1
fi

# ---------------------------------------------------------------- phase 1 ---
phase "1. Fabric samples + binaries"
if [[ -d "$FABRIC_DIR/test-network" ]]; then
  skip "already at $FABRIC_DIR"
else
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "would clone fabric-samples at $FABRIC_SAMPLES_REF into $FABRIC_DIR"
  else
    git clone --quiet https://github.com/hyperledger/fabric-samples.git "$FABRIC_DIR"
    git -C "$FABRIC_DIR" checkout --quiet "$FABRIC_SAMPLES_REF"
    ( cd "$FABRIC_DIR" && ./install-fabric.sh --fabric-version 2.5.15 binary )
    ok "cloned and installed the Fabric binaries"
  fi
fi

# ---------------------------------------------------------------- phase 2 ---
phase "2. Network, channel, peers"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^peer0.org1.example.com$'; then
  skip "network already running"
else
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "would run: cd $FABRIC_DIR/test-network && ./network.sh up createChannel -c $CHANNEL"
  else
    ( cd "$FABRIC_DIR/test-network" && ./network.sh up createChannel -c "$CHANNEL" )
    ok "network up, channel $CHANNEL created and joined"
  fi
fi

# ---------------------------------------------------------------- phase 3 ---
phase "3. Six role identities (Fabric CA, role attribute embedded in the cert)"
export PATH="$FABRIC_DIR/bin:$PATH"
export FABRIC_CA_CLIENT_HOME="$FABRIC_DIR/test-network"
CA_CERT="$FABRIC_DIR/test-network/organizations/fabric-ca/org1/ca-cert.pem"
for i in "${!ROLES[@]}"; do
  identity="${ROLES[$i]}"
  msp="$FABRIC_DIR/test-network/organizations/peerOrganizations/org1.example.com/users/${identity}@org1.example.com/msp"
  if [[ -f "$msp/signcerts/cert.pem" ]]; then
    skip "$identity already enrolled"
    continue
  fi
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "would register + enroll $identity with role=${ROLE_ATTRS[$i]}"
    continue
  fi
  secret="$(openssl rand -hex 12)"
  fabric-ca-client register --caname ca-org1 --id.name "$identity" --id.secret "$secret" \
    --id.type client --id.attrs "role=${ROLE_ATTRS[$i]}:ecert" \
    --tls.certfiles "$CA_CERT" -u "$CA_ORG1_URL" >/dev/null 2>&1 || true   # already registered is fine
  fabric-ca-client enroll -u "https://${identity}:${secret}@localhost:7054" --caname ca-org1 \
    -M "$msp" --tls.certfiles "$CA_CERT" --enrollment.attrs "role" >/dev/null
  mv "$msp/signcerts/"*.pem "$msp/signcerts/cert.pem" 2>/dev/null || true
  # NodeOUs: without this the Fabric Gateway refuses the identity outright.
  cat > "$msp/config.yaml" <<'YAML'
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/ca.org1.example.com-cert.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/ca.org1.example.com-cert.pem
    OrganizationalUnitIdentifier: peer
YAML
  ok "$identity enrolled with role=${ROLE_ATTRS[$i]}"
done

# ---------------------------------------------------------------- phase 4 ---
phase "4. Verdict-attestation keypair"
KEY_DIR="$FABRIC_DIR/verdict-attestation-key"
if [[ -f "$KEY_DIR/private.pem" ]]; then
  skip "keypair already exists at $KEY_DIR"
elif [[ $CHECK_ONLY -eq 1 ]]; then
  warn "would generate a P-256 keypair and compile its public half into chaincode/batch/batch.go"
else
  mkdir -p "$KEY_DIR"
  openssl ecparam -name prime256v1 -genkey -noout -out "$KEY_DIR/private.pem"
  openssl ec -in "$KEY_DIR/private.pem" -pubout -out "$KEY_DIR/public.pem" 2>/dev/null
  # The public half is a constant in the chaincode (a key change is a reviewed
  # lifecycle upgrade, ADR-CT-018-era decision). For a *local demo* this script
  # patches the constant and rebuilds, so the pair always matches. Do not do
  # this to a deployment anyone else depends on.
  python3 - "$KEY_DIR/public.pem" "$REPO/chaincode/batch/batch.go" <<'PY'
import re, sys
pub, target = open(sys.argv[1]).read().strip(), sys.argv[2]
src = open(target).read()
src = re.sub(r'(const verdictAttestationPublicKeyPEM = `)(.*?)(`)', lambda m: m.group(1) + pub + m.group(3), src, flags=re.S)
open(target, "w").write(src)
print("patched the compiled-in public key")
PY
  ok "generated keypair; private key stays outside the repo at $KEY_DIR"
fi

# ---------------------------------------------------------------- phase 5 ---
phase "5. Chaincode (refdata, then batch) via the formal lifecycle"
if [[ $CHECK_ONLY -eq 1 ]]; then
  warn "would package/install/approve/commit refdata and batch, using the next sequence each"
else
  for module in refdata batch; do
    ( cd "$REPO/chaincode/$module" && GOFLAGS=-mod=vendor go build ./... )
    ok "$module builds"
  done
  warn "deploying chaincode is the one phase this script leaves to docs/14 §7"
  printf '         (it needs the peer CLI environment for both orgs, and the next\n'
  printf '          sequence number from `peer lifecycle chaincode querycommitted`)\n'
fi

# ---------------------------------------------------------------- phase 6 ---
phase "6. Off-chain stores, API and app"
if [[ $CHECK_ONLY -eq 1 ]]; then
  warn "would run: docker compose up -d && npm run seed:users && npm install (root, backend) && seed reference data"
else
  ( cd "$REPO" && docker compose up -d >/dev/null && ok "Postgres + MinIO up" )
  ( cd "$REPO/backend" && [[ -d node_modules ]] || npm install --silent )
  if [[ -f "$REPO/backend/.env" ]]; then
    skip "backend/.env already present"
  else
    sed "s#^FABRIC_MSP_ROOT=.*#FABRIC_MSP_ROOT=$FABRIC_DIR/test-network/organizations/peerOrganizations/org1.example.com/users#; \
         s#^FABRIC_PEER_TLS_CERT_PATH=.*#FABRIC_PEER_TLS_CERT_PATH=$FABRIC_DIR/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt#; \
         s#^VERDICT_ATTESTATION_KEY_PATH=.*#VERDICT_ATTESTATION_KEY_PATH=$KEY_DIR/private.pem#" \
      "$REPO/backend/.env.example" > "$REPO/backend/.env"
    ok "wrote backend/.env pointing at $FABRIC_DIR (rotate the placeholder secrets, docs/15 §8)"
  fi
  ( cd "$REPO/backend" && npm run seed:users >/dev/null && ok "six demo logins generated" )
fi

# ---------------------------------------------------------------- result ----
phase "You are ready when phases 0-4 and 6 say ok/skip, and §7's deploy is done"
CREDS="$REPO/backend/seeded-users.credentials.local"
if [[ -f "$CREDS" ]]; then
  LOGINS="$(sed -n 's/^\([a-z_]*\) (\(.*\)): username=\(.*\) password=.*/    \3   (\1)/p' "$CREDS")"
else
  LOGINS="    (run: cd backend && npm run seed:users)"
fi
cat <<EOF

  Start it:
    cd backend  && npm run dev        # API on :3001
    cd frontend && npm run dev        # app on :5173

  Log in as any of the six roles — each has its own Fabric identity and its own
  password, generated on this machine only:

$LOGINS

  Passwords live in $REPO/backend/seeded-users.credentials.local
  (gitignored — they are not shared with anyone, and nothing here is a real secret).

  Share it without exposing your own machine:
    cloudflared tunnel --url http://localhost:5173
EOF
