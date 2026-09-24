# HALCHECK

Halal compliance screening for cosmetics, with a record that anyone can check for themselves.

> Everything in this repository is fictional demo data. It demonstrates a
> mechanism; it is not legal advice, not a certification, and not a claim about
> real BPJPH or JAKIM requirements.

---

## The problem, in plain language

A cosmetic product sold in Indonesia or Malaysia has to show where its
ingredients came from and how it was produced. In contract manufacturing
(known as *maklon*), the brand that sells the product does not own the factory
that makes it. Ingredients get substituted, production lines get shared, and
shipments sometimes leave before compliance has actually passed.

Afterwards, the only account of what happened is the one written by the people
being checked. That leaves two separate questions:

1. **Does this product meet the halal requirements of the market it is going
   to?** - a screening question.
2. **Who confirmed each fact, and can anyone prove the record has not been
   changed since?** - an accountability question.

HALCHECK is a working demonstration of both.

## What you can actually do with it

**Screen a product.** In the *Core Screening App* you enter the ingredients and
their suppliers, choose the intended market, and the app evaluates them against
the BPJPH (Indonesia) and JAKIM (Malaysia) rule sets. You get one finding per
rule, each with a plain-language explanation - for example: *"Cetyl Alcohol is
sourced from a supplier that is not on the verified list."*

**Record the work, step by step.** The *Compliance Trail* is the part that
creates an accountable history. Six roles each have their own login backed by a
cryptographic identity, and a batch moves through them in a fixed order:

| Step | Who | What gets recorded |
|---|---|---|
| Create the batch | Ingredient QA | the destination market, fixed at creation |
| Add ingredients | Ingredient QA | each ingredient and supplier, as listed at that moment |
| Confirm production | Production QA | line segregation, and the standard that applied then |
| Record the verdict | Compliance Officer | the engine's determination, signed |
| Release for export | Export Officer | destination copied from the batch's own record, never retyped |

No step can be skipped, no role can do another role's job, and nothing can be
edited afterwards. A correction is a **new** record that points at the one it
replaces - the original stays exactly as it was, and the trail shows both.

## The unusual part: you can verify it yourself

Most software asks you to trust it. The point of this project is that it can
hand you the evidence instead.

Every batch has a **proof bundle**: a small JSON file holding the batch's
records, a digest computed from them, the signed verdict, and the public key
that signature can be checked against. One command checks all of it, offline,
with no account in this system:

```bash
npm run verify:proof -- SL-2026-026-proof-bundle.json

VERIFIED -- 7 checks, 0 failures.
  [PASS] Record ingredientRecord c204f40abf7f... hashes to the value the bundle states
  [PASS] The 2 records recompute to the batch's effective input digest
  [PASS] The bundle's public key is a readable P-256 attestation key
  [PASS] Verdict e3b03d305d68... carries a valid ECDSA attestation signature
```

Now change **one byte** inside that file and run it again:

```bash
NOT VERIFIED -- 2 of 7 checks failed. Do not treat this bundle as evidence.
```

That is the whole idea. Not that the software says the record is intact, but
that a third party can prove it is - or prove it is not.

The app also has a public **"Verify a proof bundle"** page that performs the
same check in your browser, and an **Integrity Sandbox** that attempts to break
records on the live ledger and shows the ledger's own refusal - the deployed
chaincode answering `Function UpdateIngredientRecord not found`, because there
is no update function to call.

## Try it

**Live, no install — two static pages** (no account, nothing uploaded):

- **Screening app**: <https://nadyapribadi.github.io/HalCheck/> — the actual
  rules engine: enter ingredients and suppliers, pick a market, read the
  findings. Everything runs in your browser; there is no server behind it.
- **Proof-bundle verifier**: <https://nadyapribadi.github.io/HalCheck/verify/>
  — start with either sample: one intact bundle (verified, 7 checks) and the
  same bundle with **one byte changed** (not verified, 2 checks fail). Or paste
  a bundle of your own; nothing is uploaded anywhere.

**The full Compliance Trail** (six roles, the ledger, the batch lifecycle)
cannot be static, because it needs a Fabric network, Postgres, MinIO and the
API. To share it live, a quick tunnel can expose the running app at a public
URL:

```bash
cloudflared tunnel --url http://localhost:5173     # prints a public https URL
```

Quick-tunnel links are deliberately temporary - a new random hostname each run,
valid only while that process lives - so no fixed demo URL is published here.
For a permanent address, `docs/25_cloudflare_tunnel_setup.md` walks through the
same setup using a Cloudflare account and your own domain.

**Locally**, the screening app needs only Node:

```bash
npm install
npm test        # 15 tests: the engine over three canonical scenarios
npm run dev     # the screening app
```

The full Compliance Trail also needs Docker and Go:

```bash
docker compose up -d                        # Postgres + MinIO
cd chaincode/batch && go test ./...         # 73 tests
cd backend && npm install && npm test       # 67 tests (uses the stores above)
cd backend && npm run dev                   # API on :3001
cd frontend && npm run dev                  # app on :5173 (deps come from the root install)
```

Demo logins are generated locally into a gitignored file by `npm run
seed:users`, and the Hyperledger Fabric network is set up once by following
`docs/14_developer_setup.md`.

## What this is not

- **Not a certification.** It is a demonstration, with invented products,
  suppliers and rules. Real halal certification is a regulatory process, not a
  piece of software.
- **Not production infrastructure.** It runs as a single-operator local demo:
  one organisation operates every node. The honest claim is therefore "the
  records are append-only and independently checkable", not "you can trust us".
  Multi-party hosting is a non-goal of this version.
- **Not finished.** The AI explanation feature is deliberately not connected to
  a model provider: with no key configured it says so instead of guessing, and
  it can never write to a record. Verdicts recorded before 18 Sep 2026 carry no
  stored attestation, and the verifier reports that as a note rather than
  pretending it checked them.

## Under the hood

For readers who want the engineering: the rules live in **chaincode**, not in
the UI or the API - the browser and the backend are clients of the ledger, and
a rule that exists only outside chaincode is treated as a defect. Verdicts are
computed by a deterministic engine and recorded as an **ECDSA-signed
attestation** bound to a digest of the batch's own records. Off-chain, the
system audit log is insert-only at the database grant level, and every uploaded
certificate is re-hashed against the hash stored on its immutable record each
time it is retrieved. `docs/21_decisions.md` records each decision together
with the alternatives that were rejected, and why.

## Project status

| Phase | Scope | State |
| --- | --- | --- |
| Core Screening App | engine, storage, 5 screens, frozen dataset releases | complete - 15 tests |
| P0-P3 | local Fabric network, six role identities, batch + refdata chaincode, conformance pass | complete, deployed locally |
| P4-P5 | backend API: role-based access, audit gating, idempotency, evidence storage | built and verified live |
| P6-P7 | operational and governance shells (React) | built |
| P8 | AI trail explanation | grounded by construction; returns an explicit `unavailable` until a model key is configured |
| P9 | public tunnel | documented and demonstrated |
| P10-P11 | hardening, documentation sync | applied |

Last full run: backend 67 tests, chaincode 73 (batch) + 28 (refdata), Core
Screening App 15, proof verifier 9. The live results behind the claims above are
written up in `docs/14_developer_setup.md` sections 1.8-1.11.

## Documentation

The numbered set in [`docs/`](docs/) is the specification this system was built
against: 27 documents, from business requirements to the threat model and the
decision log. Six of them (00, 01, 03, 06, 09, 12) cover both parts of the
product in one file. Start with:

| Document | Why |
| --- | --- |
| [`docs/00_project_charter.md`](docs/00_project_charter.md) | what the project promises, and what it explicitly does not |
| [`docs/03_frd.md`](docs/03_frd.md) | functional requirements, rule by rule |
| [`docs/21_decisions.md`](docs/21_decisions.md) | every architectural decision and the alternatives rejected |
| [`docs/24_demo_runbook.md`](docs/24_demo_runbook.md) | how to demonstrate it, and what to do when something breaks |
| [`docs/25_cloudflare_tunnel_setup.md`](docs/25_cloudflare_tunnel_setup.md) | sharing it at a public URL |
| [`docs/26_knowledge_graphs.md`](docs/26_knowledge_graphs.md) | the code-intelligence graphs used while working on it |
| [`AGENTS.md`](AGENTS.md) | the working agreement for humans and AI agents on this repo |

## Security

See [`SECURITY.md`](SECURITY.md) for how to report a vulnerability, and
`docs/08_security_threat_model.md` for the 25 modelled threats and their
mitigations.

## License

[MIT](LICENSE) - use it, learn from it, build on it. The documentation is
covered by the same licence.
