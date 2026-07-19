# HALCHECK — UI Specification

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Direction

Stays visually consistent with HALCHECK's existing screening-tool identity — reads as a bounded HALCHECK module, not a visually separate "blockchain app." No crypto-visual clichés (no glowing chains, coin iconography, dark cyberpunk theming).

## 2. Visual Principles

- Evidentiary, not decorative — every element represents a checkable fact.
- Role clarity above all — always obvious who's acting and what they're allowed to touch.
- Failure is not hidden — Fail states as legible as Pass, never minimized.
- Proof over assertion — tamper-evidence is demonstrable, not just claimed.

## 3. Copy & Density Principles

- Status shown as plain text/color, never icon clusters.
- One action per screen, one plain-verb label.
- Errors state the fact only — no softened tone, no apology copy.
- No decorative icons — only where one unambiguously replaces a word.
- No helper text explaining what a label already makes obvious.
- Applies identically at every breakpoint — smaller screens get more restraint, not more explanatory text.
- AI-generated content is the one place a fixed label is mandatory, not optional density — "AI summary — not an authoritative record" appears every time.

## 4. Design Tokens

### Color
| Token | Value (proposed — pending check against HALCHECK's locked tokens) | Use |
|---|---|---|
| `--status-pass` | Clear green | Pass verdicts, successful actions |
| `--status-fail` | Clear red | Fail verdicts, rejected actions |
| `--status-pending` | Neutral amber/gray | Awaiting action |
| `--status-superseded` | Muted gray | Corrected/superseded records |
| `--text-primary` | Near-black | Body text |
| `--text-secondary` | Mid-gray | Metadata, loading indicator text |
| `--border` | Light gray | Dividers, card edges |
| `--bg-surface` | White/near-white | Cards, panels |
| `--bg-page` | Very light gray | Page background |
| `--ai-accent` | Distinct, muted (e.g. light violet/blue-gray) | Reserved solely for the AI-generated label/border |

No new accent/brand color — inherits rather than introduces its own identity.

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
- `--radius`: 4px — functional, not consumer-app-soft.
- No drop shadows by default — surfaces separate via background contrast and border.
- Exception: tamper-evidence sandbox and modals get distinct emphasis treatment.

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
| Mobile | <768px | View-only — no data entry, except the AI Explanation Panel (see Section 7) |

Content max-width ~1200px, centered, at desktop tier. Mobile is view-only because data-entry screens need more simultaneous information than phone width comfortably allows without truncating detail this system's credibility depends on. System Admin module: desktop and tablet only, no mobile presence at all.

## 6. Core Components

**`RoleContextBar`** — current role identity; action-availability indicator with plain-text reason when disabled; notification badge ("N batches awaiting your action").

**`BatchTrailView`** — ordered block sequence; each block shows role, timestamp, standards anchor, status.

**`VerdictBlockDetail`** — Pass/Fail status, governing regulation, recognition-directionality outcome (explicitly labeled), submitting identity.

**`IngredientUploadPanel`** — bulk spreadsheet upload with per-row validation and per-row removal before submit; manual single-add, append-only.

**`ProductionForm` / `ExportForm`** — minimal fields per Section 3's density discipline; plain rejection reasons when blocked, including distinguishable concurrency-conflict messaging.

**`TamperEvidenceSandbox`** — visually distinct; demonstrates rejection of an alteration attempt; never touches real data.

**`RecordStatusBadge`** — reusable indicator: pending / pass / fail / superseded / awaiting-correction — text plus color, never color alone.

**`SearchableSelect`** — replaces free-text input wherever a controlled reference list applies. Type-to-filter; no option to submit a value not present in the list. Shows "no match found" rather than allowing free entry.

**`ReferenceDataTable`** — System Admin only. Lists current + deprecated entries for a reference type, deprecated entries muted but never hidden.

**`AuditLogTable`** — System Admin only. Read-only, dense data table; visually highlights any identity with 3+ denied attempts in an hour. No edit affordances exist anywhere.

**`AIExplanationPanel`** — text input (question) + response display area. Response always renders inside a container using `--ai-accent` border and the mandatory label. Plain paragraphs only, no markdown/rich rendering.

## 7. Component Adaptation by Device Tier

| Component | Desktop | Tablet | Mobile |
|---|---|---|---|
| RoleContextBar | Full | Full | Compact |
| BatchTrailView | Full detail | Full detail, vertical | Collapsed, tap-to-expand |
| VerdictBlockDetail | Modal/overlay | Modal/overlay | Single-column stack |
| IngredientUploadPanel / Forms | Full | Full, larger touch targets | Unavailable — plain-text redirect message |
| TamperEvidenceSandbox | Modal | Modal | View-only description |
| ReferenceDataTable / AuditLogTable | Full | Full | Not available |
| AIExplanationPanel | Full | Full | **Available** — the one data-adjacent feature available on mobile, since it's read-only and informational, not data entry |

## 8. Touch Target Sizing

Minimum 44×44px on tablet and mobile. Tablet spacing stays at desktop density — extra width isn't used to cram more per screen.

## 9. Interaction Patterns

| Screen | Pattern | Why |
|---|---|---|
| Batch List → Batch Detail | Full navigation | Primary content, needs full screen space |
| Verdict Block Detail | Modal/overlay | Short, view-only — glance without losing place on Batch Detail |
| Tamper-Evidence Sandbox | Modal/overlay | Modal *is* the required visual separation from real workflow |
| Production Confirmation Form | Modal/overlay | Only 2 fields — full-page nav would be more friction |
| Export Request Form | Modal/overlay | One dropdown + status readout, same reasoning |
| Ingredient Upload Panel | Full navigation | Table preview + per-row validation needs real room |
| Reference Data List | Full navigation | Table-heavy, needs real room |
| Add/Deprecate Reference Entry | Modal/overlay | Short, single-purpose action |
| Audit Log Viewer | Full navigation | Dense data table, potentially long |
| AI Explanation | Inline panel on Batch Detail, not a modal | Keeps it visually part of the trail it's explaining |
| Login | Full page | Entry point |

**Deliberately excluded:** confirmation dialogs ("are you sure?") — nothing here is destructive, the system already structurally prevents edit/delete. Multi-step wizard modals — every action is genuinely one step.

## 10. Loading Indicator

Plain, static text ("Loading…") in `--text-secondary`, no spinner, no skeleton screen. Applies identically to the AI panel ("Generating explanation…") — no animated "typing" effect.

## 11. Feedback Pattern: Success vs. Rejection

- Success: brief, dismissible toast, text only, disappears on its own.
- Rejection: always inline, never a toast — stays attached to the field/action that caused it. Includes AI explanation failures (e.g., LLM API unreachable) — renders inline in the same panel, never silently retried.

## 12. Scope Exclusions

- No bulk/multi-batch operations — one action, one batch, always. Keeps accountability unambiguous.
- No AI conversation history or follow-up-question threading — each question is a single, stateless request. No "chat" metaphor.
- No System Admin bulk reference-data import — entries added one at a time.

## 13. State Coverage

| Component/Context | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Batch List | ✓ | ✓ (first-use) | ✓ (fetch failed) | ✓ |
| Batch Detail / Trail View | ✓ | — | ✓ | ✓ |
| Ingredient Upload | ✓ | — | ✓ (per-row) | ✓ |
| Production/Export Form | — | — | ✓ (sequencing/verdict/concurrency violation) | ✓ |
| Verdict Detail | ✓ | — | — | ✓ |
| Sandbox | — | — | — (rejection is expected outcome) | — |
| Reference Data List | ✓ | ✓ (no entries yet) | ✓ | ✓ |
| Add/Deprecate Entry | — | — | ✓ (duplicate/invalid entry) | ✓ |
| Audit Log Viewer | ✓ | ✓ (first-use only) | ✓ | ✓ |
| AI Explanation Panel | ✓ | — | ✓ (LLM unavailable) | ✓ |

## 14. Interaction Rules

- Out-of-role actions show disabled state with plain-language reason, never a silent no-op.
- Fail blocks never collapsed by default.
- Corrections always show original (marked superseded) alongside the new record.
- Sandbox visually separated from real actions at all times.
- Bulk upload errors shown per-row, not as one blocking failure.
- Success = toast; rejection = inline.
- Deprecated reference-data entries always shown alongside active ones, muted, not removed.
- AI panel never pre-populated or auto-triggered — always an explicit user action.

## 15. Error Message Rule

Every error is plain language, never a raw backend reason code shown directly.

## 16. Accessibility

- Color never the sole status indicator, including for AI-generated content.
- Touch targets meet 44×44px minimum.
- Disabled/unavailable states get plain-text explanation, not just visual dimming.
- Consistent focus-visible outline for keyboard navigation.

## 17. Screenshot / Visual QA Checklist

- Full batch trail, happy path (all Pass)
- Full batch trail, including a Fail block and "Awaiting Correction" status
- Correction shown alongside superseded original
- Verdict block detail (modal), recognition-directionality labeled
- Ingredient upload, bulk and manual states, per-row removal
- Tamper-evidence sandbox (modal), before/after
- Role context bar across all 6 roles, notification badge visible
- Reference Data List, active and deprecated entries side by side
- Audit Log Viewer, populated, with a highlighted repeated-denial entry
- AI Explanation Panel, desktop and mobile, populated and unavailable states
- Tablet width: BatchTrailView collapsed/expanded, RoleContextBar wrap behavior
- Mobile: view-only redirect message on a data-entry attempt
