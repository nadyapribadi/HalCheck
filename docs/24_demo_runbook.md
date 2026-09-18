# HALCHECK — Demo Runbook

How to bring the system up, what to show in what order, and what to do when something breaks mid-recording. Written for a single-operator local demo (`docs/23_roadmap.md` v1.0: demonstrated, not deployed).

## 1. Pre-flight (10 minutes before recording)

Run the health check first — every line must say "ok":

```bash
cd "$(git rev-parse --show-toplevel)"     # this repository
./scripts/health-check.sh
```

It covers the off-chain stores, the ledger containers, the loopback bindings, the backend on `:3001`, and the frontend on `:5173`. If it fails, fix that first — a recording where the audience sees a failure you already knew about is worse than a delayed recording.

Then, in three terminal windows:

```bash
# 1. ledger + stores (if not already running)
docker compose up -d
cd ~/fabric-samples-halcheck-p0/test-network && ./network.sh up

# 2. backend
cd ~/Documents/GitHub/HalCheck/backend && npm run dev

# 3. frontend
cd ~/Documents/GitHub/HalCheck/frontend && npm run dev
```

Demo logins live in `backend/seeded-users.credentials.local` (gitignored, six roles). Keep that file in a window the recording will not show.

## 2. Run order

| # | Screen | Role | What it proves |
|---|---|---|---|
| 1 | Login → Batch list | Ingredient QA | Role-scoped landing: only batches awaiting ingredients or correction, plus the "N batches awaiting your action" badge |
| 2 | Start New Batch → Ingredient panel | Ingredient QA | Intended market captured once; ingredient and source come from governed reference lists, with no free-text path |
| 3 | Batch detail → Confirm Production | Production QA | Sequencing enforced by the ledger; the production block cites the standard version it resolved |
| 4 | Batch detail → Record Verdict | Compliance Officer | The engine's binding determination, signed and recorded with its attestation digest |
| 5 | Batch detail → Request Export | Export Officer | Destination copied from the batch's own market; export blocked unless the current verdict is Pass |

## 3. The five moments worth recording

**1. The happy path** — steps 1–5 above, ending in an export release. Show the trail afterward: four connected blocks, each naming its submitting identity.

**2. Fail → correction → Pass → export** (the strongest sequence). Submit an ingredient that reference data classifies as halal-risk, sourced from an unverified supplier (`Cetyl Alcohol` from `PT Distribusi Kosmetik Prima` — the Suppliers screen shows each entry's Verification status, which is the fact the verdict is decided on, and every submission snapshots it onto its own record instead of looking it up later, ADR-CT-033):

- Record Verdict returns **Fail**, and the verdict block names the flagged record and the fail reason, not just the word "fail".
- Request Export is **blocked** — point at the reason shown: no valid compliance verdict on record.
- Correct the flagged ingredient to a verified supplier. Say plainly that there is **no field anywhere on that screen naming which record is being corrected** — the chaincode derives it from the batch's own Fail verdict.
- Record Verdict again → **Pass**. The new attestation digest was recomputed over the corrected and original records in ledger key order, which is what makes the correction provable rather than asserted.
- Request Export now succeeds.

**3. The Integrity Sandbox** — both modes, on a batch with at least one record. Both now make real calls to the deployed chaincode, so what the audience sees is the ledger's own answer: Mode 1 returns the contract's refusal (`Function UpdateIngredientRecord not found in contract BatchContract`) **and** two hashes that no longer match — the record as the ledger holds it, and the same bytes with one byte changed. Mode 2 types an unlisted ingredient and gets `not_a_recognized_value` twice: once from the reference list, once from the chaincode refusing the submission itself. Neither mode can write anything, and the screen says why. Close the moment with **Verify integrity** (next row) rather than moving straight on.

**3b. Verify integrity, then break it yourself** — from Batch Detail, open *Verify integrity*. Seven checks run in the browser: each record's hash, the recomputed batch digest, the published key, the verdict's ECDSA signature, the batch binding. Then press **Try to alter a record**: one byte flips in memory and the same checks fail in front of the audience. If someone asks "could you have faked this screen?", download the bundle and run `cd backend && npm run verify:proof -- ~/Downloads/<batch>-proof-bundle.json` in a terminal — exit 0 verified, exit 1 not — or open the sign-in screen's "Verify a proof bundle (no account needed)" link and paste the same file there. That is the whole argument: the check does not need us.

**4. Attempted bypass** — log in as Brand Owner (read-only) and show that no action appears on any batch. For the stronger version, invoke chaincode directly as that identity and show the ledger itself refusing with `role_scope_violation`. This is the point the project exists to make: the rule is not in the UI.

**5. Recognition edge case** — in the Core Screening App (repository root, `npm run dev`), evaluate the Malaysia-issued certificate against the Indonesia market and show the recognition finding as its own labelled result rather than a generic failure.

## 4. What to say about limits (say it before someone asks)

- All domain content — standards, ingredients, certificates, recognition agreements — is fictional and labelled as such. This demonstrates a mechanism, not regulatory guidance.
- The screening engine and the Compliance Trail are two halves of one repository; only the trail is ledger-backed.
- The ledger is a local two-organisation dev network on one laptop. No hosting, no second operator, no production key custody.
- The AI Explanation panel returns "unavailable" on purpose — the feature is not built, and it will not fabricate an answer in the meantime.
- A verdict is reproducible against the batch's own records, not against "today's" reference data: verifying a supplier afterwards does not change a verdict recorded earlier (ADR-CT-033, shown live on `SL-2026-023`). Say it before someone tries it — it looks like a bug until it is explained, and it is the point of the design.

## 5. When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| Every write returns `503 ledger_unavailable`, but reads work | The backend's ledger connection went stale after the orderer or peers restarted | **Restart the backend process** (ADR-CT-032). The ledger itself is fine — check with a `peer chaincode query` if you want proof first |
| `docker compose ps` shows Postgres or MinIO unhealthy | Docker Desktop restarted, or a container died | `docker compose up -d`, then re-run `scripts/health-check.sh` |
| Login says "Session expired" | The JWT secret was rotated, or the 8-hour expiry passed | Log in again; that is the documented behaviour, not a fault |
| "Not a recognized ingredient/supplier" on a value you can see listed | The value's only versions are deprecated — the dropdown shows active ones | Re-add it in the governance shell (System Admin → Reference data); that creates the next version rather than a duplicate |
| Ingredient submission rejected with `missing_reference_metadata` | The supplier's reference entry carries no verification status, so the compliance fact the verdict needs has no owner (ADR-CT-033) | System Admin → Reference data → Suppliers: deprecate that entry and re-add it with a Verification status — the ledger refuses the submission until then, by design |
| A verdict returns `engine_dataset_mismatch` (500) | A *pre-existing* ingredient record (written before 2026-09-18) whose supplier is in neither the record nor the engine's frozen release | Not fixable at runtime — that fact has no owner left. Record it as a defect; new records cannot reach this state, and the submissions made through the demo never will |
| The UI says "The backend is not reachable" while `curl localhost:3001/health` is fine | The browser is pointed somewhere else: a leftover `frontend/.env.local` from a dead quick tunnel (`VITE_API_BASE_URL=https://…trycloudflare.com`), and/or the backend's `ALLOWED_ORIGIN` no longer lists `http://localhost:5173` | Delete/rename `frontend/.env.local`, make sure `ALLOWED_ORIGIN` lists the local origin (it accepts a comma-separated list), restart both dev servers. curl never shows this — it does not enforce CORS (ADR-CT-035, docs/25) |

After any ledger interruption the recovery order is: restore the ledger containers, restart the backend, re-run `scripts/health-check.sh`, then confirm one read and one write before recording.

## 6. Related documents

- `docs/13_implementation_plan.md` — phase definitions and exit criteria
- `docs/14_developer_setup.md` §11 — tunnel setup and the negative-exposure test
- `docs/21_decisions.md` ADR-CT-027 through ADR-CT-033 — the decisions this runbook assumes
- `docs/23_roadmap.md` — what v1.0 does and does not claim
