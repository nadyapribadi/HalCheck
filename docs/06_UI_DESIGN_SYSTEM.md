# UI Design System

## 1. Direction

HALCHECK looks like a professional compliance instrument:

- light, document-like surfaces (the app produces reports; it should feel like where reports come from)
- dense, scannable tables
- a verdict color never appears without the standard name and a text label
- citations always visible or one click away
- print is a first-class target, not an afterthought

## 2. Principles

- Trustworthy, not decorative.
- `insufficient_info` must never look like `non_compliant`.
- "Standard is silent" must never look like missing data.
- Original-language quotes keep their own visual style, like quoted material.
- Fictional demo data is always labeled.
- Screen and print share the same tokens.

## 3. Theme Tokens

```css
:root {
  --bg: #fafaf8;
  --surface: #ffffff;
  --surface-2: #f4f4f0;
  --border: #e2e1da;
  --border-strong: #c9c8bf;
  --text: #1e1e1a;
  --text-dim: #5c5b52;
  --text-faint: #8a897e;
  --accent: #0f5e4f;          /* deep teal: calm authority */
  --accent-soft: #e3efec;

  /* verdicts: dot + label + standard code, always together */
  --v-compliant: #1a7a4a;     --v-compliant-bg: #e8f5ee;
  --v-conditional: #9a6b00;   --v-conditional-bg: #fdf3dd;
  --v-noncompliant: #b3261e;  --v-noncompliant-bg: #fceceb;
  --v-insufficient: #4a5568;  --v-insufficient-bg: #eef1f5;

  /* reference states */
  --silent: #8a897e;          --silent-bg: #f4f4f0;   /* hatched */
  --limited: #7c5cbf;         --limited-bg: #f1ecfa;  /* source access limited */
  --oos: #6b7280;             --oos-bg: #f3f4f6;      /* out of scope marker */
}
```

No dark mode in v1 (print parity comes first).

## 4. Typography

```css
--sans: "Inter", system-ui, sans-serif;        /* UI and reports */
--mono: "JetBrains Mono", ui-monospace, monospace; /* clause refs, versions, dates, IDs */
--serif: "Source Serif 4", Georgia, serif;     /* original-language quotes */
```

- Mono for anything a reviewer would verify: clause, dataset version, run ID, dates.
- Serif with a left border for original-language quotes, tagged with the language.
- No hero text. Report headings follow document style (numbered sections).

## 5. Layout

```text
top bar:       56px  (name, dataset version badge, demo banner slot)
left nav:      200px (Reference / Clients / Runs / Report)
content:       flexible, max 1280px
detail panel:  360px slide-in (rule detail, finding detail)
```

Key screens:

```text
Matrix:        8 criteria rows x 2 body columns, sticky headers
Rule detail:   slide-in, citation block pinned at the bottom
Intake:        plain-language questions grouped by chain stage
Wizard:        stage-ordered stepper, sourcing -> retail
Run results:   steps grouped by stage; divergence rows pinned on top
Report:        A4 portrait print view, numbered sections
```

Minimum viewport 1280x800. Print target A4 portrait.

## 6. Core Components

### `DemoBanner`
- "Demo with fictional data" label, always visible on the demo client.
- Reset demo button (with confirm) and export/import actions.

### `MatrixCell`
- 1-2 attribute chips plus overflow count.
- Variants: normal, silence (hatched + text), source-limited (flag + text).
- Click opens `RuleDetail`.

### `RuleDetail`
- English summary, attribute rows, original quote (collapsed, serif, language tag).
- Citation block: document, clause (mono), link, published date, retrieved date, reviewer + date.
- Dataset version badge.

### `VerdictBadge`
- Dot + label + body code, e.g. `● Non-compliant · JAKIM`.
- Overridden: engine verdict struck through next to the active verdict, with an override icon.
- Never rendered without the body code.

### `RecognitionGrid`
- One-way grid: rows = recognizing body, columns = recognized body.
- Level marks: full / conditional / none / unverified. Cell click shows citation and scope note.

### `IntakeQuestion`
- Plain question, answer options, always includes "I don't know".
- Shows which chain stage and which attribute it fills.

### `StepCard`
- Type icon, label, country, maklon tag for contract factories.
- Completeness meter (how many attributes are still unknown).
- Ingredient-sensitivity flag renders as an out-of-scope marker, not a verdict.

### `FindingRow`
- One-line rule summary + clause (mono) + `VerdictBadge`.
- Rationale expander: checked / matched / failed / missing as labeled lists.
- Override action opens a dialog with a required reason field.

### `DeltaRow`
- One step, verdicts per body side by side.
- Divergent steps highlighted and pinned to the top by default.

### `GapItemCard`
- Linked finding, step, citation, editable fix text (template pre-filled), priority, status.

### `DataRequestList`
- Built from insufficient_info findings, grouped by step, phrased as questions.
- Copy-as-checklist action.

### `RunHeader`
- Client, run date, dataset version (mono), standards, engine version.
- Override count. Frozen indicator after completion.

### `ReportPrintView`
- Fixed section order (see architecture doc).
- Disclaimer and fictional-data label on every page. Page numbers, report ID (mono).

### `StalenessBadge`
- Per body: days since retrieval date; warning past 180 days.

## 7. Interaction Rules

- Matrix cell click opens the detail panel; Esc closes; the URL deep-links.
- Wizard autosaves each step to localStorage; nothing typed is ever lost.
- Starting a run shows what will be pinned (dataset version + standards) before confirming.
- Completed runs are visibly frozen; only overrides and gap edits remain active.
- The override submit button stays disabled while the reason is empty.
- Reset demo always asks for confirmation and states what will be cleared.

## 8. Accessibility

- Verdicts are triple-coded: color + dot shape + text.
- Hatched silence cells also carry text.
- All interactive cells reachable by keyboard; the detail panel traps focus.
- Original quotes carry a `lang` attribute for screen readers.
- Tables use proper header scoping on both axes.

## 9. Visual QA Checklist

- Matrix with all 16 cells: include at least one silence and one source-limited cell.
- Rule detail with a Malay or Indonesian quote expanded.
- Recognition grid showing all four levels.
- Wizard step with unknown attributes and the completeness meter.
- Run results showing all four verdicts in one view.
- A finding with an override (engine verdict still visible).
- Delta view with two divergent steps pinned on top.
- Print preview: disclaimer on every page, readable in grayscale.
- Demo banner and reset flow.
