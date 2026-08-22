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
