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
