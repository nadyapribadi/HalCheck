# Technical Requirements Document

## 1. Technical Strategy

HALCHECK is a static, data-first app. There is no backend. The product is defined by three things:

1. The dataset schema (versioned JSON, shipped with the app).
2. The rules engine (a pure TypeScript function).
3. The UI that projects both.

The critical path is small and local:

```text
profile snapshot + rules + recognitions -> pure engine function -> findings
```

No network call, no AI call, no server sits inside that path.

## 2. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 19 + TypeScript + Vite | Current React line; proven in IMTRACK; Kilo-friendly |
| Styling | Tailwind CSS | Fast, consistent with design tokens |
| Data (reference) | Versioned JSON files bundled with the app | No server needed; releases are git-tagged files |
| Data (user) | Browser localStorage | Visitor data stays on their device |
| Engine | Pure TypeScript module, zero runtime dependencies | Testable, portable |
| Hosting | Cloudflare Pages | Static, free, never sleeps; deploys from private GitHub |
| Build tools | VS Code + Kilo Code, GitHub | The proven workflow |
| Backend | None in v1 | See `12_V2_BACKEND_CONCEPT.md` for the future Supabase path |

Framework note: Nuxt is not used in v1. HALCHECK is a React/Vite static app with no backend, no SSR requirement, and a pure TypeScript engine. A Vue/Nuxt rebuild would only make sense if this project later becomes a Vue portfolio piece or needs Nuxt-specific server and routing features.

## 3. Repository Structure

```text
halcheck/
|-- src/
|   |-- app/            # routes, layout, demo banner
|   |-- features/
|   |   |-- reference/  # matrix, rule detail, recognition, strictness
|   |   |-- intake/     # generated questionnaire
|   |   |-- profiles/   # profile + step wizard
|   |   |-- screening/  # runs, findings, delta, overrides
|   |   `-- report/     # gap items, print view
|   |-- engine/         # PURE rules engine (imports nothing from app)
|   |   |-- types.ts    # attribute contracts, verdicts, inputs/outputs
|   |   |-- evaluate.ts # evaluate(target, rule, recognitions) -> Finding
|   |   |-- rationale.ts
|   |   `-- __tests__/  # golden cases per criterion
|   |-- storage/        # localStorage read/write, versioned keys, export/import
|   |-- data/           # loads the bundled dataset release
|   `-- config/         # disclaimer text, thresholds, fix templates
|-- dataset/
|   |-- briefs/         # research brief per body
|   |-- drafts/         # raw model output, committed unchanged
|   |-- verified/       # human-reviewed rules
|   `-- releases/       # frozen release files (v1.0.0.json ...)
|-- docs/               # this suite
`-- public/
```

Hard boundary: `engine/` may not import from `features/`, `storage/`, or `data/`. It takes plain objects in and returns plain objects out. This keeps verdict logic testable alone and portable later.

## 4. Data Model (TypeScript types + JSON)

Exact file formats and storage keys live in `08_DATA_AND_STATE_CONTRACT.md`. The core types:

```text
Body              { id, code, name, jurisdiction }
SourceDocument    { id, bodyId, identifier, title, publishedOn, status }
Criterion         { id, code, label, order }            // fixed 8
Rule              { id, bodyId, criterionId, sector,
                    scope: 'step' | 'chain',
                    stepTypes[], summaryEn,
                    quoteOriginal?, quoteLang?,
                    attributes,                            // typed per criterion
                    silence?, sourceAccessLimited?,
                    citation { documentId, clauseRef?, url?,
                               publishedOn, retrievedOn },
                    status: 'draft' | 'verified',
                    reviewedBy?, reviewedOn? }
Recognition       { recognizingBodyId, recognizedBodyId,
                    level: 'full'|'conditional'|'none'|'unverified',
                    scopeNote, citation }
DatasetRelease    { version, releasedOn, notes,
                    bodies[], documents[], rules[], recognitions[] }
Profile           { id, name, segment, targetMarkets[],
                    chainAttributes, createdAt }
ChainStep         { id, profileId, type, label, country,
                    attributes, order }
Run               { id, profileSnapshot, datasetVersion,
                    standardBodyIds[], engineVersion,
                    findings[], completedAt }              // frozen
Finding           { target: stepRef | 'chain', ruleId, bodyId,
                    verdict, rationale }
Override          { findingRef, verdict, reason, at }
GapItem           { findingRef, fixText, priority, status }
```

Rules:

- `Rule.attributes` follows a fixed contract per criterion (see architecture doc, section 8). The research brief JSON schema is generated from these same types, so brief and engine can never drift.
- `Run.profileSnapshot` embeds full step data at run time. Findings reference steps inside the snapshot, so later profile edits never touch history.
- A release file is complete on its own: one JSON file holds everything the app needs for that version.

## 5. Engine Contract

```text
evaluate(
  target: ChainStep | ChainProfileAttributes,
  rule: Rule,
  recognitions: Recognition[]
) -> Finding
```

- Pure, synchronous, deterministic.
- Verdict order inside one check: unknown attribute -> insufficient_info (stop). Explicit fail -> non_compliant. Pass that depends on outside evidence -> conditional. Full pass -> compliant.
- Certificate checks: a certificate from body X counts for a rule of body Y using `recognitions` (Y recognizes X). full = pass, conditional = conditional, none = fail, unverified = insufficient_info. Direction matters.
- Rationale is structured lists (checked / matched / failed / missing), rendered to text in the UI, stored with the finding.
- Step-type filter runs first: a rule that does not apply to a step type produces no finding at all.
- The engine version string is stored on every run.

## 6. Dataset Pipeline

- Brief per body in `dataset/briefs/`, with the output JSON schema embedded.
- Model output lands unchanged in `dataset/drafts/<body>.json` (audit trail).
- Review promotes rules into `dataset/verified/<body>.json`. The git diff between draft and verified is the review record.
- A release script validates: schema, full cell coverage (bodies x 8), citation completeness. It then writes `dataset/releases/vX.Y.Z.json`. One missing citation blocks the release.
- The app imports exactly one release file per build.

## 7. Storage Requirements (browser)

- All user data under a namespaced key prefix with a schema version (details in `08_DATA_AND_STATE_CONTRACT.md`).
- A schema version bump ships a small migration function; unknown versions fail safe (offer export, never silent data loss).
- Export/import: one JSON file with profiles, runs, overrides, gap items.
- "Reset demo data" clears the namespace and re-seeds the demo client, after a confirm step.

## 8. Performance Requirements

| Area | Target |
| --- | --- |
| Engine, 30 steps x ~30 rules x 2 standards | Under 200 ms in the browser |
| First load (dataset bundled) | Under 2 s |
| Rule detail open | Under 300 ms (data already loaded) |
| Print view | Under 3 s for 100 gap items |

Bundle discipline: the release JSON is small (hundreds of rules at most). No heavy chart or PDF libraries in v1.

## 9. Security Requirements (summary)

Full model in `10_SECURITY_THREAT_MODEL.md`. Headlines:

- No secrets exist anywhere in this project. No API keys, no tokens, no env files at runtime.
- User-entered text (step labels, notes, reasons) is rendered as text, never as HTML.
- Dependencies are few and pinned. New dependencies need a reason.
- The dataset ships publicly in the bundle. Quotes stay short and cited.

## 10. Testing Requirements (summary)

Full plan in `09_TEST_STRATEGY.md`. Headlines:

- Engine golden tests are the heavy layer: per criterion, per verdict, per body pattern, including recognition direction cases.
- Release script validators have their own tests (coverage gate, citation gate).
- Storage migration tests: old key version in, correct data out.
- Historical render test: a stored run renders identically without calling the engine.

## 11. Release Engineering

- App version and dataset version are independent SemVer.
- Every deploy records both (visible in the app footer).
- CI on push: typecheck, lint, engine tests, release-script dry run when `/dataset` changes.
- Changelog kept for app and dataset.

## 12. Documentation Rules

- Attribute contracts are documented as comments in `engine/types.ts`. That file is the single source for the research brief schema.
- All docs in plain English, short sentences, terms defined in `13_GLOSSARY.md`.
- Examples use fictional companies only.
