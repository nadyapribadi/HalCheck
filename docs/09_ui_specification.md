# HALCHECK — UI Specification

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.2.0-planning

## Changelog

- **v0.2.0:** `BatchTrailView` now specified as a connected vertical timeline, not a flat stacked list (Section 6). `TamperEvidenceSandbox` renamed to `IntegritySandbox`, now with two demonstration modes (Sections 6, 9, 13, 17). `ReferenceDataTable` now renders the deprecated→superseding link. Added a new component, `VerdictHistoryStrip`, for prior-verdict display on re-recording.

## 1. Direction

Stays visually consistent with HALCHECK's existing screening-tool identity — reads as related to the product, not a visually separate "blockchain app." No crypto-visual clichés.

## 2. Visual Principles

- Evidentiary, not decorative — every element represents a checkable fact.
- Role clarity above all — always obvious who's acting and what they're allowed to touch.
- Failure is not hidden — Fail states as legible as Pass, never minimized.
- Proof over assertion — every claim the system makes (tamper-evidence, controlled vocabulary) is demonstrable, not just stated.

## 3. Copy & Density Principles

- Status shown as plain text/color, never icon clusters.
- One action per screen, one plain-verb label.
- Errors state the fact only — no softened tone, no apology copy.
- No decorative icons — only where one unambiguously replaces a word.
- No helper text explaining what a label already makes obvious.
- Applies identically at every breakpoint.
- AI-generated content is the one place a fixed label is mandatory, not optional density.

## 4. Design Tokens

### Color
| Token | Value (proposed) | Use |
|---|---|---|
| `--status-pass` | Clear green | Pass verdicts, successful actions |
| `--status-fail` | Clear red | Fail verdicts, rejected actions |
| `--status-pending` | Neutral amber/gray | Awaiting action |
| `--status-superseded` | Muted gray | Corrected/superseded records, deprecated reference entries |
| `--text-primary` | Near-black | Body text |
| `--text-secondary` | Mid-gray | Metadata, loading indicator text |
| `--border` | Light gray | Dividers, card edges |
| `--bg-surface` | White/near-white | Cards, panels |
| `--bg-page` | Very light gray | Page background |
| `--ai-accent` | Distinct, muted (e.g. light violet/blue-gray) | Reserved solely for the AI-generated label/border |
| `--timeline-connector` | Same value as `--border`, slightly heavier weight | The connecting line in `BatchTrailView` |

### Typography
| Token | Value (proposed) | Use |
|---|---|---|
| `--font-body` | System UI stack | Body text, labels, buttons |
| `--font-mono` | Monospace stack | Batch IDs, hashes, timestamps |
| Type scale | 14 / 16 / 20 / 24px | Body / field labels / section headers / page title |

### Spacing
```text
--space-xs: 4px / --space-sm: 8px / --space-md: 16px / --space-lg: 24px / --space-xl: 32px
```

### Borders and Elevation
- `--radius`: 4px.
- No drop shadows by default.
- Exception: `IntegritySandbox` and modals get distinct emphasis treatment.

### Iconography
No icon library for decoration; icons only where genuinely ambiguous without one.

### Interactive States
```text
default -> hover (subtle bg shift) -> active (pressed) -> disabled (reduced opacity + adjacent plain-text reason)
focus-visible: single consistent outline, always present
```

## 5. Breakpoints and Functional Tiers

| Tier | Width | Functionality |
|---|---|---|
| Desktop | 1024px+ | Full — all roles, all actions |
| Tablet | 768–1023px | Full — touch-adapted |
| Mobile | <768px | View-only — no data entry, except the AI Explanation Panel |

Content max-width ~1200px, centered, at desktop tier. System Admin module: desktop and tablet only.

## 6. Core Components

**`RoleContextBar`** — current role identity; action-availability indicator with plain-text reason when disabled; notification badge.

**`BatchTrailView` (updated):** rendered as a connected vertical timeline — each block joined to the next by a visible connector line (`--timeline-connector`), rather than a flat stacked list. Same underlying data as before; the change is purely presentational, directly addressing visual continuity. Each block shows role, timestamp, standards anchor, status.

**`VerdictBlockDetail`** — Pass/Fail status, governing regulation, recognition-directionality outcome (evaluated against the batch's Intended Market), the flagged record (if Fail), submitting identity.

**`IngredientUploadPanel`** — bulk spreadsheet upload with per-row validation and per-row removal before submit; manual single-add, append-only. Correction mode shows only the single flagged record.

**`ProductionForm` / `ExportForm`** — minimal fields; `ExportForm` no longer includes a destination selector, only a read-only display of the batch's Intended Market.

**`IntegritySandbox` (renamed from `TamperEvidenceSandbox`):** two modes — (1) attempt to alter an existing record, demonstrating immutability; (2) attempt to submit an unlisted ingredient/supplier via a raw text field, demonstrating that controlled-vocabulary rejection is enforced server-side, not just by the `SearchableSelect` UI control. Visually distinct border/background, shared across both modes.

**`RecordStatusBadge`** — reusable indicator: pending / pass / fail / superseded / awaiting-correction.

**`SearchableSelect`** — replaces free-text input wherever a controlled reference list applies.

**`ReferenceDataTable` (updated):** lists current + deprecated entries; deprecated rows now show an inline "→ superseded by [entry name]" link using the existing `superseded_by` field.

**`AuditLogTable`** — System Admin only. Highlights identities with 3+ denied attempts in an hour.

**`AIExplanationPanel`** — text input + response display, `--ai-accent` border, mandatory label.

**`VerdictHistoryStrip` (NEW):** a small, compact strip shown above the Record Verdict action when a batch has a prior verdict on record. Displays: prior status, date, and (if Fail) the flagged record — e.g., "Previous: Fail (12 Jul) — Cetyl Alcohol. Corrected 13 Jul." Plain text, `--text-secondary`, no icons.

## 7. Component Adaptation by Device Tier

| Component | Desktop | Tablet | Mobile |
|---|---|---|---|
| RoleContextBar | Full | Full | Compact |
| BatchTrailView | Full timeline | Full timeline, vertical | Collapsed, tap-to-expand |
| VerdictBlockDetail | Modal/overlay | Modal/overlay | Single-column stack |
| IngredientUploadPanel / Forms | Full | Full, larger touch targets | Unavailable |
| IntegritySandbox | Modal, both modes | Modal, both modes | View-only description |
| ReferenceDataTable / AuditLogTable | Full | Full | Not available |
| AIExplanationPanel | Full | Full | Available |
| VerdictHistoryStrip | Inline | Inline | Not shown (Record Verdict is a desktop/tablet-only action) |

## 8. Touch Target Sizing

Minimum 44×44px on tablet and mobile. Tablet spacing stays at desktop density.

## 9. Interaction Patterns

| Screen | Pattern | Why |
|---|---|---|
| Batch List → Batch Detail | Full navigation | Primary content |
| Verdict Block Detail | Modal/overlay | Short, view-only |
| Integrity Sandbox | Modal/overlay | Modal is the required visual separation from real workflow, for both modes |
| Production Confirmation Form | Modal/overlay | Only 2 fields |
| Export Request Form | Modal/overlay | Read-only display + one action |
| Ingredient Upload Panel | Full navigation | Table preview + per-row validation needs real room |
| Reference Data List | Full navigation | Table-heavy |
| Add/Deprecate Reference Entry | Modal/overlay | Short, single-purpose action |
| Audit Log Viewer | Full navigation | Dense data table |
| AI Explanation | Inline panel on Batch Detail | Keeps it visually part of the trail it's explaining |
| Login | Full page | Entry point |

**Deliberately excluded:** confirmation dialogs. Multi-step wizard modals.

## 10. Loading Indicator

Plain, static text ("Loading…"), no spinner, no skeleton screen.

## 11. Feedback Pattern: Success vs. Rejection

Success: brief, dismissible toast. Rejection: always inline, never a toast — including both `IntegritySandbox` modes, which always resolve inline within the sandbox itself.

## 12. Scope Exclusions

- No bulk/multi-batch operations.
- No AI conversation history or follow-up-question threading.
- No System Admin bulk reference-data import.

## 13. State Coverage

| Component/Context | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Batch List | ✓ | ✓ (first-use) | ✓ (fetch failed) | ✓ |
| Batch Detail / Trail View | ✓ | — | ✓ | ✓ |
| Ingredient Upload | ✓ | — | ✓ (per-row) | ✓ |
| Production/Export Form | — | — | ✓ (sequencing/verdict/concurrency violation) | ✓ |
| Verdict Detail | ✓ | — | — | ✓ |
| Integrity Sandbox (both modes) | — | — | — (rejection is expected outcome in both modes) | — |
| Reference Data List | ✓ | ✓ (no entries yet) | ✓ | ✓ |
| Add/Deprecate Entry | — | — | ✓ (duplicate/invalid entry) | ✓ |
| Audit Log Viewer | ✓ | ✓ (first-use only) | ✓ | ✓ |
| AI Explanation Panel | ✓ | — | ✓ (LLM unavailable) | ✓ |

## 14. Interaction Rules

- Out-of-role actions show disabled state with plain-language reason, never a silent no-op.
- Fail blocks never collapsed by default.
- Corrections always show original (marked superseded) alongside the new record.
- Both Integrity Sandbox modes are visually separated from real actions at all times.
- Bulk upload errors shown per-row.
- Success = toast; rejection = inline.
- Deprecated reference-data entries always shown alongside active ones, with their superseding link visible.
- AI panel never pre-populated or auto-triggered.

## 15. Error Message Rule

Every error is plain language, never a raw backend reason code shown directly.

## 16. Accessibility

- Color never the sole status indicator.
- Touch targets meet 44×44px minimum.
- Disabled/unavailable states get plain-text explanation.
- Consistent focus-visible outline.
- The timeline connector (`--timeline-connector`) is a visual aid only — block order is also conveyed via explicit timestamps, not the line alone.

## 17. Screenshot / Visual QA Checklist

- Full batch trail as a connected timeline, happy path (all Pass)
- Full batch trail including a Fail block with the flagged record visible, and "Awaiting Correction" status
- Correction shown alongside superseded original
- Verdict block detail (modal), recognition-directionality labeled, evaluated against Intended Market
- Record Verdict screen showing `VerdictHistoryStrip` on a re-recorded batch
- Ingredient upload, bulk and manual states, per-row removal, correction mode showing only the flagged row
- Integrity Sandbox — Mode 1 (alter attempt) before/after
- Integrity Sandbox — Mode 2 (unlisted value attempt) before/after
- Role context bar across all 6 roles, notification badge visible
- Reference Data List, active and deprecated entries with visible supersession links
- Audit Log Viewer, populated, with a highlighted repeated-denial entry
- AI Explanation Panel, desktop and mobile, populated and unavailable states
- Export Request Form showing read-only Intended Market display
- Tablet width: BatchTrailView collapsed/expanded, RoleContextBar wrap behavior
- Mobile: view-only redirect message on a data-entry attempt

---

## Core Screening App UI Specification

*The following section covers HALCHECK's other module — the Core Screening App, the engine Compliance Trail wraps. Module: Core Screening App. Status: Design in progress.*

### 18. Direction

Same visual identity Section 1 above already commits to matching — this section is what it's matching *against*. Evidentiary, not decorative; plain language; no crypto-visual or lab-report clichés, since this is a screening tool, not a certificate generator.

### 19. Visual Principles

- Every Finding is traceable — a Fail is never shown without its rule citation and flagged ingredient visible in the same view.
- Status shown as plain text/color, consistent with the `--status-pass`/`--status-fail` tokens defined in Section 4 (reused directly, not redefined, since both modules are one product).
- Reference data (standards, ingredients, recognition agreements) is always inspectable — a user should never have to trust a Finding without being able to look up the rule it cites.

### 20. Design Tokens

Reuses the token set from Section 4 directly — `--status-pass`, `--status-fail`, `--status-pending`, `--text-primary`/`--text-secondary`, `--border`, the spacing scale, `--radius`. No separate token set is defined for this app; one visual system serves both modules, per Section 1's principle that Compliance Trail "reads as related to the product, not a visually separate app."

### 21. Screens

| Screen | Route (indicative) | Maps to feature module |
|---|---|---|
| Profile Setup | `/` | `profiles` |
| Ingredient Intake | `/intake` | `intake` |
| Reference Browser | `/reference` | `reference` |
| Screening Run / Results | `/screening` | `screening` (engine) |
| Report | `/report` | `report` |

### 22. Profile Setup

**Fields:** Intended Market (`SearchableSelect`: Indonesia/BPJPH, Malaysia/JAKIM), Product Type (`SearchableSelect`, from active dataset release).
**Actions:** Start Screening → Ingredient Intake.
**Rule:** Intended Market is locked once a run exists on this profile (FRD-CORE-PROFILE-002); changing it starts a new profile.

### 23. Ingredient Intake

**Fields:** Ingredient Name (`SearchableSelect`), Source/Supplier (`SearchableSelect`), Halal Risk Flag (auto-populated, overridable with required reason), Certificate Issuing Body (optional, `SearchableSelect`: BPJPH / JAKIM / none).
**Bulk entry:** paste/import table, per-row validation, per-row removal before running screening — the same interaction pattern as `IngredientUploadPanel` (Section 6), reused for visual consistency.
**Actions:** Add ingredient, Remove (per row), Run Screening.

### 24. Reference Browser

**Displayed:** four tabs — Standards, Ingredients, Suppliers, Recognition Agreements — each a read-only table, active dataset release version shown at the top of the screen.
**No actions** beyond viewing — this app never writes reference data (see `12_seed_data_specification.md`, Core Screening App Dataset Specification section, §1, for how releases are authored).

### 25. Screening Run / Results

**Displayed:** overall status (Pass/Fail, `--status-pass`/`--status-fail`), then every Finding grouped by rule — result, citation, rationale, flagged ingredient (if fail), recognition detail (if applicable) — shown inline, not collapsed by default, matching Section 2's "Fail states as legible as Pass" principle.
**Actions:** View Report, Start New Profile.

### 26. Report

**Displayed:** same Finding list as Screening Run, plus dataset release version, engine version, and a fixed disclaimer line. This is deterministic engine output, not AI-generated, so it uses standard `--text-secondary` styling — the `--ai-accent` token stays reserved solely for Compliance Trail's AI Explanation feature, never reused here.
**Actions:** Export (print/PDF or file export), Start New Profile.
**Disclaimer copy (fixed, every render):** "This is a screening opinion, not a certification, and not a religious ruling."

### 27. Interaction Rules

- No screen introduces a field not implied by an FRD-CORE requirement (mirrors Section 11's governing rule for Compliance Trail screens).
- A rejected intake value ("Not a recognized ingredient/supplier") shows inline, never as a toast, matching Section 11's rejection-is-inline convention.
- Recognition-directionality outcomes are always labeled explicitly by name ("Recognition check: JAKIM → BPJPH — not recognized"), never folded into a generic fail message, matching PRD-CORE-005.

### 28. Accessibility

Same rules as Section 16 above: color is never the sole status indicator, focus-visible outline is always present, and every disabled action carries a plain-text reason.
