// The public verifier, as a static page (ADR-CT-034, README "Try it").
//
// No bundler magic, no framework, no API calls: it imports the same
// src/proof/verifyProofBundle.ts the CLI uses and runs it in the browser. That
// is the entire point of this page -- verification must not depend on the
// system whose claims are being checked, so it cannot depend on its backend
// either.
import {
  ProofBundleFormatError,
  verifyProofBundle,
  type ProofVerificationReport,
} from "../src/proof/verifyProofBundle";

const SAMPLES = [
  {
    file: "../samples/proof-bundle-verified.json",
    label: "Sample: an intact bundle",
    hint: "a real batch, recorded on the local ledger",
  },
  {
    file: "../samples/proof-bundle-tampered.json",
    label: "Sample: one byte changed",
    hint: "the same bundle, altered after signing",
  },
];

const app = document.getElementById("app")!;
app.innerHTML = `
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 32px 20px 64px;
      font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #1f2937; background: #f7f8fa;
    }
    main { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
    h2 { font-size: 17px; margin: 0 0 8px; }
    .muted { color: #6b7280; }
    .lede { margin: 0 0 24px; max-width: 68ch; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; margin-bottom: 16px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button {
      font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #d1d5db;
      background: #fff; color: #111827; cursor: pointer;
    }
    button.primary { background: #111827; border-color: #111827; color: #fff; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    textarea {
      width: 100%; min-height: 150px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 10px; border-radius: 8px; border: 1px solid #d1d5db; resize: vertical;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
    code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; word-break: break-all; }
    .verdict { border-radius: 8px; padding: 12px 14px; margin: 16px 0; font-weight: 600; }
    .verdict.ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .verdict.bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .pill { font-size: 12px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
    .pill.pass { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .pill.fail { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .pill.info { background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; }
    a { color: #1d4ed8; }
  </style>

  <h1>Verify a proof bundle</h1>
  <p class="lede">
    A proof bundle holds a compliance batch's records, the digest they produce, the signed verdict recorded
    against them, and the public key that signature can be checked with. Pasting one here re-hashes every
    record, recomputes the digest and verifies the ECDSA signature — <strong>in this browser tab</strong>.
    Nothing is uploaded, and no account is involved.
  </p>

  <div class="card">
    <h2>Start with a sample</h2>
    <p class="muted" style="margin-top:0">
      Both samples come from the same batch. One is as recorded; in the other, a single byte of one record was
      flipped after signing.
    </p>
    <div class="row" id="samples"></div>
  </div>

  <div class="card">
    <h2>Or paste / open your own</h2>
    <div class="row" style="margin-bottom:10px">
      <input type="file" id="file" accept="application/json,.json" aria-label="Open a proof bundle file" />
      <button class="primary" id="run" disabled>Verify</button>
    </div>
    <textarea id="json" placeholder='{"bundleVersion":1,"batchId":"...","integrity":{...}'></textarea>
    <p class="muted" id="status" style="margin-bottom:0"></p>
  </div>

  <div id="result"></div>

  <p class="muted">
    The same check is available offline: <code>npm run verify:proof -- bundle.json</code> (exit 0 verified,
    1 not, 2 unreadable). The Compliance Trail application produces these bundles —
    <a href="../">about the project</a>.
  </p>
`;

const textarea = document.getElementById("json") as HTMLTextAreaElement;
const runButton = document.getElementById("run") as HTMLButtonElement;
const fileInput = document.getElementById("file") as HTMLInputElement;
const status = document.getElementById("status")!;
const result = document.getElementById("result")!;
const samples = document.getElementById("samples")!;

function setBusy(message: string): void {
  status.textContent = message;
  runButton.disabled = true;
}

function showError(message: string): void {
  result.innerHTML = `<div class="verdict bad">${escapeHtml(message)}</div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

function render(report: ProofVerificationReport): void {
  const failures = report.checks.filter((check) => check.status === "fail").length;
  const headline = report.ok
    ? `Verified — batch ${escapeHtml(report.batchId)}: every record matches its hash, the digest recomputes, and the signed verdict checks out.`
    : `Not verified — batch ${escapeHtml(report.batchId)}: ${failures} of ${report.checks.length} checks failed. Do not treat this bundle as evidence.`;

  result.innerHTML = `
    <div class="verdict ${report.ok ? "ok" : "bad"}">${headline}</div>
    <div class="card">
      <table>
        <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
        <tbody>
          ${report.checks
            .map(
              (check) => `
            <tr>
              <td>${escapeHtml(check.label)}</td>
              <td><span class="pill ${check.status}">${check.status === "pass" ? "Pass" : check.status === "fail" ? "Fail" : "Note"}</span></td>
              <td class="muted mono">${escapeHtml(check.detail)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function verify(raw: string): Promise<void> {
  setBusy("Checking…");
  try {
    const parsed: unknown = JSON.parse(raw);
    render(await verifyProofBundle(parsed));
    status.textContent = "Checked in this browser — nothing was sent anywhere.";
  } catch (err) {
    if (err instanceof ProofBundleFormatError) showError(err.message);
    else if (err instanceof SyntaxError) showError(`That is not valid JSON: ${err.message}`);
    else showError(err instanceof Error ? err.message : "The bundle could not be checked.");
    status.textContent = "";
  } finally {
    runButton.disabled = textarea.value.trim().length === 0;
  }
}

for (const sample of SAMPLES) {
  const button = document.createElement("button");
  button.innerHTML = `${sample.label} <span class="muted">— ${sample.hint}</span>`;
  button.addEventListener("click", () => {
    setBusy(`Loading ${sample.label.toLowerCase()}…`);
    void fetch(sample.file)
      .then((response) => response.text())
      .then((text) => {
        textarea.value = text;
        return verify(text);
      })
      .catch(() => showError("That sample could not be loaded."));
  });
  samples.appendChild(button);
}

textarea.addEventListener("input", () => {
  runButton.disabled = textarea.value.trim().length === 0;
});

runButton.addEventListener("click", () => void verify(textarea.value));

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    textarea.value = text;
    return verify(text);
  });
});
