import React from "react";
import { ApiError, login } from "../api/client";
import { session, type Role } from "../auth/session";
import { navigate } from "../app/router";
import { roleLandingPath } from "../lib/useBatches";
import { TextField } from "../components/Field";

// docs/11 §2: username + password, both required, no remember-me and no
// account creation. Server-side failures are shown in the backend's own
// words so the two never drift apart.
export function LoginScreen(): React.ReactElement {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const expired = session.expiredMessagePending();

  React.useEffect(() => {
    if (expired) session.clearExpiredMessage();
  }, [expired]);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(username, password);
      const role = result.role as Role;
      session.set({ token: result.token, role, expiresAt: result.expires_at });
      navigate(roleLandingPath(role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to log in.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 style={{ marginBottom: 4 }}>Compliance Trail</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Recorded accountability for halal contract manufacturing.
        </p>

        {expired ? <div className="feedback feedback-info" style={{ marginBottom: 16 }}>Session expired, please log in again.</div> : null}
        {error ? <div className="feedback feedback-error" style={{ marginBottom: 16 }}>{error}</div> : null}

        <TextField label="Username" value={username} onChange={setUsername} required />
        <TextField label="Password" value={password} onChange={setPassword} type="password" required />

        <button className="primary" type="submit" disabled={!canSubmit} style={{ width: "100%" }}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        {/* ADR-CT-034: verification must not need an account, so the verifier
            is linked from the one screen everybody can reach. */}
        <p style={{ marginTop: 16 }}>
          <button type="button" onClick={() => navigate("/verify")}>
            Verify a proof bundle (no account needed)
          </button>
        </p>
      </form>
    </div>
  );
}
