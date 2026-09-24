# Assets

Visual material that documents what the system looks like. Everything here shows
**fictional demo data** — the same disclaimer as the rest of the repository
applies.

## `halcheck-big-idea.excalidraw`

The whole argument on one canvas, in the style the project's own visual rules
ask for (dark `#0F172A`, Excalidraw). Open it at <https://excalidraw.com> (File →
Open) or in the Excalidraw VS Code extension. It is safe to edit: the file is
the source, not an export.

Reading order: the problem (the record is written by the party being checked) →
the ledger pipeline with chaincode-enforced roles → the verdict bound to a
digest and signed → the proof bundle → any third party verifying it, or
disproving it with a one-byte change.

## `screenshots/`

| File | What it shows | Where it came from |
|---|---|---|
| `screening-app.png` | the screening app's start screen | the published static demo |
| `screening-findings.png` | a real run: `Overall: Fail`, with the governing rule (`JAKIM-ING-001 — JAKIM HC-2024`), the rationale, and the flagged ingredient | the published static demo |
| `verify-landing.png` | the public verifier before anything is loaded | the published static demo |
| `verify-verified.png` | an intact proof bundle: 7 checks, 0 failures | the published static demo, using the sample bundle |
| `verify-tampered.png` | the same bundle with one byte changed: 2 checks fail | the published static demo, using the sample bundle |
| `trail-batch-list.png` | Ingredient QA's role-scoped queue, with the demo batch and the "awaiting your action" badge | a deliberate demo run on a local stack |
| `trail-batch-detail.png` | the recorded trail: ingredient → production → **Fail** verdict, naming the flagged record and the fail reason | same run |
| `trail-integrity-verified.png` | the integrity panel, all checks passing, on that batch | same run |
| `trail-integrity-tampered.png` | the same panel after one byte is altered in memory | same run |
| `trail-sandbox.png` | the Integrity Sandbox returning the deployed contract's own refusal | same run |

The five `verify-*`/`screening-*` shots come from
<https://nadyapribadi.github.io/HalCheck/> because that demo is reproducible by
anyone: it has no ledger behind it, so it cannot accidentally show a developer's
in-progress records.

The `trail-*` shots have to come from a running local stack, and are taken from a
**deliberate demo run**: batch `SL-2026-027`, created for the purpose with the
canonical reference data in `docs/12_seed_data_specification.md` (Cetyl Alcohol
from the unverified supplier), following the moments in
`docs/24_demo_runbook.md` §3 — not from whatever state a development ledger
happens to be in. A first attempt used the existing ledger and produced
screenshots full of verification scaffolding (`Ekstrak Uji ADR33`), which is how
the `Test1` vocabulary leak in ADR-CT-036 was found in the first place.
