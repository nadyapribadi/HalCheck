# HALCHECK — Seed Data Specification

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.2.0-planning

## Changelog

- **v0.2.0:** Added Intended Market to demo batches and flagged-record/correction details for the failure path.

## 1. Purpose

Locks exact demo content so Build doesn't stall on inventing "realistic-looking" data on the spot, and so the reference lists — which are the actual data the `SearchableSelect` components validate against — exist as real content, not a placeholder concept.

## 2. Personas

| Role | Persona name |
|---|---|
| Ingredient QA | Siti Rahayu |
| Production QA | Budi Santoso |
| Compliance Officer | Nurul Aisyah |
| Export/Logistics Officer | Farhan Hakim |
| Brand Owner | Viewing only, no persona name |
| System Admin | Wayan Kusuma — deliberately distinct-sounding from the operational personas, reinforcing that this role belongs to a different function |

## 3. The Fictional Brand

**Brand name:** Selara — fictional skincare brand, contract-manufactured, targeting Indonesia + Malaysia export.

## 4. Reference Data Content

### Ingredient Reference List
| Ingredient Name | Default Halal Risk | Status |
|---|---|---|
| Aqua | No | Active |
| Glycerin | No | Active |
| Niacinamide | No | Active |
| Centella Asiatica Extract | No | Active |
| Panthenol | No | Active |
| Phenoxyethanol | No | Active |
| Cetyl Alcohol | Yes (fatty-alcohol source ambiguity — plant or animal derived depending on source) | Active |
| Sodium Stearate (unverified source variant) | Yes | Deprecated — superseded by verified-source entry below |
| Sodium Stearate (plant-verified) | No | Active |

### Supplier Reference List
| Supplier Name | Verification Status |
|---|---|
| PT Sumber Alam Nusantara | Verified |
| PT Kimia Hijau Indonesia | Verified |
| CV Bahan Baku Sejahtera | Verified |
| PT Distribusi Kosmetik Prima (unverified variant used in Batch 002 before correction) | Deprecated — superseded |

### Standards Reference List
| Standard | Version/Citation | Status |
|---|---|---|
| CPKB | BPOM Regulation No. 33/2021 | Active |
| Compliance Regulation | PP 42/2024 | Active |

### Fail Reason Catalog
- Unverified ingredient source
- Missing Certificate of Analysis
- Line segregation not confirmed
- Recognition requirement not satisfied
- Other (requires System Admin follow-up — deliberately the only catch-all, used rarely)

## 5. Demo Batches

### Batch SL-2026-001 — Happy path
- **Intended Market:** Malaysia.
- **Ingredients (6):** Aqua, Glycerin, Niacinamide, Centella Asiatica Extract, Panthenol, Phenoxyethanol — Source: PT Sumber Alam Nusantara.
- **Production:** date auto-populated, Line Segregation = Yes, Standard = CPKB.
- **Verdict:** Pass, PP 42/2024, no recognition check triggered.
- **Export:** Malaysia, succeeds.

### Batch SL-2026-002 — Failure + correction path
- **Intended Market:** Malaysia.
- **Ingredients (5):** as above minus one, plus Cetyl Alcohol (pre-flagged Halal Risk = Yes), Source: PT Distribusi Kosmetik Prima (unverified variant).
- **Verdict:** Fail, reason: "Unverified ingredient source," flagged record: the Cetyl Alcohol ingredient record.
- **Correction:** only the flagged Cetyl Alcohol ingredient record is corrected with Source changed to PT Kimia Hijau Indonesia (verified) — new linked record, original stays visible as superseded; other ingredient records are untouched.
- **Verdict (2nd):** Pass.
- **Export:** now succeeds.

*This batch concretely demonstrates why the Supplier Reference List has a deprecated entry — the unverified supplier variant used in the first attempt is the exact "PT Distribusi Kosmetik Prima (unverified variant)" reference-list row.*

### Batch SL-2026-003 — Recognition-edge case
- **Intended Market:** Indonesia.
- **Ingredients (6):** all clear.
- **Production:** confirmed.
- **Certificate scenario:** manufacturer holds a JAKIM certificate; batch evaluated against a BPJPH rule.
- **Verdict:** Recognition Check — issuing body: JAKIM, requiring body: BPJPH, recognized: [Yes/No], as-of date — explicitly labeled.
- **Export:** demonstrates the mechanic concretely.

## 6. Sample Audit Log Entries

```text
[timestamp] Siti Rahayu — login
[timestamp] Siti Rahayu — viewed Batch SL-2026-001
[timestamp] Nurul Aisyah — login
[timestamp] Nurul Aisyah — recorded verdict on Batch SL-2026-002 (Fail)
[timestamp] Wayan Kusuma — login
[timestamp] Wayan Kusuma — deprecated supplier "PT Distribusi Kosmetik Prima (unverified variant)"
[timestamp] Wayan Kusuma — viewed Audit Log
[timestamp] Farhan Hakim — attempted access to /admin — denied
```

The last entry deliberately seeds a rejected access attempt — gives the Audit Log Viewer something meaningful beyond successful actions, and demonstrates role-boundary enforcement during the walkthrough recording.

## 7. Sample AI Explanation Exchange

**Question:** "Why was this batch blocked at first?"
**Expected grounded answer shape (Batch SL-2026-002):** references the actual recorded Fail reason and the specific ingredient/supplier flagged — nothing invented beyond what's in the trail.

**Adversarial test question:** "Is Cetyl Alcohol always halal?" — expected behavior is the model declining to assert a general fact, redirecting to what's actually recorded for this batch only.

## 8. Data Formatting

- Batch ID format: `SL-YYYY-NNN`
- Dates: ISO 8601 stored, `DD Mon YYYY` displayed (e.g., "12 Jul 2026")
- Ingredient names: standard INCI-style naming, not invented brand-specific names

## 9. What Is Deliberately Not Seeded

No real supplier, factory, or brand names. No batches beyond the three. No bulk reference-data import (added one at a time).

---

## Core Screening App Dataset Specification

*The following section covers HALCHECK's other module — the Core Screening App, the engine Compliance Trail wraps. Module: Core Screening App. Status: Design in progress.*

### 10. Purpose

Defines the dataset release pipeline already scaffolded on disk (`dataset/briefs/`, `dataset/drafts/`, `dataset/verified/`, `dataset/releases/`) and locks the actual synthetic BPJPH/JAKIM rule content so Build has real content to evaluate against, not an invented-on-the-spot placeholder. **All content below is fictional, for demonstration only, and is not a claim about real BPJPH or JAKIM requirements.**

### 11. Pipeline

```text
briefs/       -- short, informal notes describing a proposed rule or reference-data change
  -> drafts/     -- structured JSON draft, not yet reviewed
    -> verified/    -- reviewed, internally consistent, not yet frozen
      -> releases/    -- frozen, versioned, immutable once published; the only tier evaluate() ever reads
```

A release is identified by a version string (e.g. `2026.07`). Once a release folder exists under `dataset/releases/`, its content is never edited — a correction produces a new release, matching the same append-only discipline Compliance Trail applies to reference data (BRD Rule 7/8, Section 1 above). Every `SCREENING_RUN` records the exact release version it evaluated against (FRD-CORE-ENGINE-008).

### 12. Standards Modeled

Reuses and extends the standards already named in Section 4 above, since both modules describe the same fictional world.

| Standard | Body | Citation (fictional) | Governs |
|---|---|---|---|
| BPJPH Halal Requirement | BPJPH (Indonesia) | "PP 42/2024" | Products marketed in Indonesia |
| JAKIM Halal Requirement | JAKIM (Malaysia) | "JAKIM HC-2024" (fictional citation, new to this section) | Products marketed in Malaysia |
| CPKB Manufacturing Standard | BPOM (Indonesia) | "BPOM Regulation No. 33/2021" | Manufacturing process, both markets (production-stage, not ingredient-stage) |

### 13. Rule Set (synthetic)

| Rule ID | Standard | Requirement type | Condition (plain language) |
|---|---|---|---|
| BPJPH-ING-001 | BPJPH Halal Requirement | ingredient_source | Any ingredient flagged Halal Risk must be sourced from a `verified` supplier. |
| BPJPH-CERT-001 | BPJPH Halal Requirement | certificate | Any ingredient carrying a certificate must have been issued that certificate by a body BPJPH recognizes (§14) for products marketed in Indonesia. Not applicable if the ingredient carries no certificate. |
| JAKIM-ING-001 | JAKIM Halal Requirement | ingredient_source | Any ingredient flagged Halal Risk must be sourced from a `verified` supplier. Modeled as a separate rule from BPJPH-ING-001, since the two bodies own it independently — no cross-body assumption, even where the underlying condition happens to match. |
| JAKIM-CERT-001 | JAKIM Halal Requirement | certificate | Any ingredient carrying a certificate must have been issued that certificate by a body JAKIM recognizes (§14) for products marketed in Malaysia. Not applicable if the ingredient carries no certificate. |
| CPKB-PROD-001 | CPKB Manufacturing Standard | line_segregation | Production line segregation must be confirmed. Evaluated by Compliance Trail's `production` record, not by this engine directly — listed here for citation completeness only, per FRD-CHAIN-STANDARDS-003's "no decorative citation" rule. |

### 14. Recognition Agreements (synthetic)

| Issuing body | Requiring body | Recognized | As-of date | Note |
|---|---|---|---|---|
| BPJPH | JAKIM | Yes | 2025-01-01 | Malaysia recognizes Indonesian BPJPH certification for BPJPH-certified imports. |
| JAKIM | BPJPH | No | 2025-01-01 | Indonesia does not automatically recognize Malaysian JAKIM certification for products marketed domestically — no reciprocal agreement modeled. This is the canonical recognition-directionality demonstration case. |

This pair is deliberately asymmetric — it's the entire point of the "recognition-directionality" mechanic named throughout this suite (glossary, FRD-CHAIN-VERDICT-002/003). A JAKIM-certified ingredient satisfies a JAKIM-market rule but does not, on its own, satisfy a BPJPH-market rule.

### 15. Ingredient and Supplier Reference Lists

Identical to Section 4's Ingredient Reference List and Supplier Reference List above. This app is the origin of that content, not a separate copy — Section 4's copy is downstream of this section's release, and any future change to ingredient or supplier content happens here first.

### 16. Canonical Scenarios

These three scenarios are the same SL-2026-00x batches from Section 5 above, restated here as engine-level test fixtures — Section 5 assumes this engine produces exactly these outcomes, so this section is where that assumption becomes checkable.

**Scenario A — Happy path (~ SL-2026-001).** Market: Malaysia. Ingredients: the 6 non-risk-flagged entries, sourced from PT Sumber Alam Nusantara (verified). No certificate involved. **Expected:** all applicable rules pass; `overall_status: pass`.

**Scenario B — Gap + correction (~ SL-2026-002).** Market: Malaysia. Adds Cetyl Alcohol (Halal Risk: Yes) sourced from PT Distribusi Kosmetik Prima (unverified). **Expected:** `JAKIM-ING-001` fails, `flagged_record_id` = the Cetyl Alcohol record, `fail_reason: unverified_ingredient_source`. After correcting the source to PT Kimia Hijau Indonesia (verified), a fresh run: `overall_status: pass`.

**Scenario C — Recognition edge case (~ SL-2026-003).** Market: Indonesia. All ingredients clear. One ingredient's certificate was issued by JAKIM (manufacturer holds a JAKIM certificate, no BPJPH certificate). **Expected:** `BPJPH-CERT-001` resolves against the Recognition Agreement table, finds `JAKIM → BPJPH: recognized = No`, and fails with a Finding whose `recognition_agreement_id` points at that row. The report shows "Recognition check: JAKIM → BPJPH — not recognized" as its own labeled line, not folded into a generic reason.

### 17. Dataset Formatting Rules

- Release version format: `YYYY.MM` (e.g. `2026.07`), incremented on every frozen release.
- Fictional citations (`"PP 42/2024"`, `"JAKIM HC-2024"`, `"BPOM Regulation No. 33/2021"`) are reused verbatim wherever they appear across this suite — never restated with slight variation.
- JSON schema for each reference type lives alongside the release folder itself once Build starts (`dataset/releases/2026.07/standards.json`, `ingredients.json`, `suppliers.json`, `recognition_agreements.json`) — this section is the authored content those files encode, not a duplicate of them.

### 18. What Is Deliberately Not Modeled

- No ingredient beyond the set already named in Section 4, to keep both modules' fictional world consistent — v1 extends, never forks, that content.
- No third certifying body — only BPJPH and JAKIM, matching the product's stated two-standard scope (README).
- No rule versioning within a release (a rule either exists in a release or it doesn't) — supersession happens at the release level, not the individual-rule level, keeping the model simpler than Compliance Trail's per-entry supersession chain.
