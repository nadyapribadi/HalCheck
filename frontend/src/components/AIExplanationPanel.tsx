import React from "react";
import { ApiError, api } from "../api/client";

// docs/11 §14. The response carries the mandatory label on every render, and
// the panel is read-only by construction: the only call it can make is the
// explanation endpoint, which is grounded in this batch's own recorded trail.
export function AIExplanationPanel({ batchId }: { batchId: string }): React.ReactElement {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function ask(): Promise<void> {
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await api<{ answer?: string }>(`/batches/${batchId}/explain`, {
        method: "POST",
        body: { question },
      });
      setAnswer(result.answer ?? "The service returned no answer.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-emphasis">
      <h3>Ask about this batch</h3>
      <p className="muted" style={{ marginBottom: 8 }}>
        AI-generated summary — not an authoritative record.
      </p>
      <div className="field">
        <label htmlFor="ai-question">Question</label>
        <input
          id="ai-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Why was this batch flagged?"
        />
      </div>
      {error ? <div className="feedback feedback-info">{error}</div> : null}
      {answer ? <p>{answer}</p> : null}
      <div className="row">
        <button type="button" disabled={busy || question.trim().length === 0} onClick={() => void ask()}>
          {answer ? "Ask another question" : "Ask"}
        </button>
      </div>
    </section>
  );
}
