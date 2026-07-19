# HALCHECK — Screen Requirements

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

## 1. Purpose

Specifies field-by-field, action-by-action content for every screen in the route table (`10_ui_flow_navigation.md` Section 6). No screen introduces a field, action, or validation rule not already implied by an FRD requirement.

## 2. Login

**Fields:** Username (text, required), Password (password, required).
**Actions:** Log In.
**Validation:** Both fields required before submit is enabled. Invalid credentials → "Incorrect username or password."
**Explicitly excluded:** remember-me, password reset, account creation — internal tool, accounts provisioned externally.

## 3. Batch List

**Displayed columns:** Batch ID, Status, Last Updated.

**Status values:** Awaiting Ingredients, Awaiting Production, Awaiting Verdict, Pass, Fail, **Awaiting Correction**, Awaiting Export, Exported. "Awaiting Correction" uses `--status-fail`-adjacent styling — visually related to Fail (since it originates from one) but distinguishable.

**Filtering:** automatic, by role. Ingredient QA's filter includes both `awaiting_ingredients` and `awaiting_correction`.
**Sorting:** Last Updated (default, descending) or Batch ID.
**Search:** single text field, Batch ID only.
**Actions:** View (per row) → Batch Detail; Start New Batch (Ingredient QA only).
**Empty state:** role-specific one-line guidance.

## 4. RoleContextBar — Notification Badge

**Displayed:** count badge adjacent to role name — "3 batches awaiting your action" (singular: "1 batch awaiting your action").
**Behavior:** not rendered when count is zero; click navigates to filtered Batch List; recomputed on every Batch List load.
**Copy rule:** exact count stated plainly, no vague language.

## 5. Batch Detail / Trail View

**Displayed content:** Batch ID (header); ordered list of recorded blocks (1 to 4); each block shows type, submitting role, timestamp, status, standards anchor where applicable.

**Actions (role- and state-dependent, exactly one visible per role per batch state):**

| Role | Batch state | Action shown |
|---|---|---|
| Production QA | Ingredient record exists, no production record | "Confirm Production" |
| Compliance Officer | Production record exists, no verdict | "Record Verdict" |
| Export/Logistics Officer | Verdict = Pass, no export record | "Request Export" |
| Export/Logistics Officer | Verdict = Fail or missing | "Request Export" shown disabled, reason: "No valid compliance verdict on record" |
| Brand Owner | Any state | No action shown |

**Verdict action label:** "Record Verdict" — no "approve" or "confirm" phrasing, since the engine's output is binding and the officer has no discretion (FRD-CHAIN-VERDICT-005).

**Secondary actions:** "Try the tamper-evidence sandbox" (all roles, any batch with ≥1 record); "Ask about this batch" (opens AI Explanation Panel inline, all 5 operational roles, any batch state).

## 6. Ingredient Upload Panel

**Fields:**
- Ingredient Name: `SearchableSelect`, sourced from Ingredient Reference List — no free-text option
- Source: `SearchableSelect`, sourced from Supplier Reference List — no free-text option
- Halal Risk Flag: auto-populated from the matched reference entry; editable only with an explicit override reason field (shown only if overriding)

**Preview (pre-submit):** row-by-row list — ingredient name, validation result, and a **Remove** action per row.

**Bulk upload:** spreadsheet rows validated against both reference lists. A row whose ingredient or supplier doesn't match is rejected at that row: "Not a recognized [ingredient/supplier] — check spelling or contact System Admin to add it."

**Actions:** Submit, Cancel, Add Another Ingredient (manual entry, same field types).

**Correction submissions:** identical screen/behavior when opened against a batch in "Awaiting Correction" status — no separate correction mode.

## 7. Production Confirmation Form

**Fields:**
- Batch Date: display-only, system-populated from submission timestamp — not a date picker
- Line Segregation Confirmed: Yes/No, required
- Standard: display-only, auto-filled ("CPKB")

**Actions:** Submit, Cancel.
**Validation:** Line Segregation Confirmed required. Sequencing violation → "This batch needs an ingredient record before production can be confirmed."

## 8. Verdict Block Detail

**Displayed content (read-only):**
- Status: Pass / Fail
- Governing Regulation
- Recognition Check (when applicable): issuing body, requiring body, recognized Yes/No, as-of date — explicitly labeled
- Fail reason (if Fail): from Fail Reason catalog, plain text
- Submitted by: role/persona name, timestamp

**Framing copy:** described as "the recorded compliance determination," not "the officer's decision."

**Actions:** none — view-only. (The action to create a verdict lives on Batch Detail.)

## 9. Export Request Form

**Fields:** Destination Market (dropdown; "Malaysia" in this version).

**Displayed (read-only, contextual):**
- Current verdict status
- Pass: "Verdict confirmed — export may proceed"
- Fail/missing: "Export unavailable — no valid compliance verdict on record" (submit disabled)
- Concurrency conflict: "This batch was just updated by another action. Please refresh and try again." (distinguishable from the verdict-missing rejection)

**Actions:** Request Export (disabled unless verdict = Pass), Cancel.

## 10. Tamper-Evidence Sandbox

**Fields:** Record selector (dropdown, any existing record on the current batch).
**Actions:** Attempt Change.
**Result:** "Rejected — this record cannot be altered. A correction may be submitted as a new record instead."
**Framing text:** "This is a demonstration. It does not affect any real data."

## 11. Reference Data Overview (System Admin)

**Displayed content:** four category tiles (Ingredients, Suppliers, Standards, Fail Reasons), each with a count of active entries.
**Actions:** select category → Reference Data List; View Audit Log link.
**Empty state:** "No reference data configured yet."

## 12. Reference Data List (System Admin, per category)

**Displayed columns:** entry name/value, status (Active/Deprecated), version/date added, added by.
**Actions:** Add New Entry (modal); Deprecate (active rows only).
**Sorting:** alphabetical, default.
**Rule:** deprecated entries always shown, muted — never filtered out by default.

### 12.1 Add Reference Entry (modal)
**Fields:** Entry name/value (free text — the legitimate exception, since System Admin defines the vocabulary, not selects from it); category-specific metadata (e.g., default Halal Risk classification for Ingredients).
**Validation:** reject exact-duplicate entry names within the same category (case-insensitive).
**Actions:** Submit, Cancel.

### 12.2 Deprecate Reference Entry (modal)
**Displayed:** entry name, plain confirmation that this marks deprecated, does not delete.
**Fields:** none required — no reason field, unlike Fail verdicts.
**Actions:** Confirm Deprecate, Cancel.

## 13. Audit Log Viewer (System Admin only)

**Displayed columns:** Timestamp, Identity, Action, Module/Screen.
**Filtering:** date range; identity (`SearchableSelect`, not free text).
**Sorting:** timestamp, descending, default.
**Visual rule:** any identity with 3+ denied access attempts within an hour is highlighted (warning-tone row background, inline label "Repeated denied attempts").
**No actions beyond viewing** — zero write affordances anywhere.
**Empty state:** "No audit entries yet" (first-use only).

## 14. AI Explanation Panel (inline component on Batch Detail)

**Fields:** Question (free text — the one legitimate free-text field among operational screens).
**Displayed (after submission):** response text, plain paragraphs; fixed label "AI-generated summary — not an authoritative record."
**Actions:** Ask; Ask another question (clears field, no threading/history).
**Explicitly excluded:** no regenerate, no follow-up context, no conversation view.

## 15. Cross-Cutting Field Rules

- Dates: `DD Mon YYYY` display format.
- Every disabled action has an adjacent plain-text reason.
- Every `SearchableSelect` field shows "No match found — check spelling or contact System Admin" rather than allowing free entry.
- Concurrency rejection messaging follows the same plain-language rule as every other rejection.
- **Language decision:** all UI copy is in **English** — chosen for portfolio-audience-first framing, given this project's primary purpose as a demonstration piece.
- No screen introduces a field not implied by an FRD requirement.
