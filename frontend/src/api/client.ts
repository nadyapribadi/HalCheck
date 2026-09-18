import { session } from "../auth/session";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1";

// Every rejection the backend can return is reason-coded (docs/17 §14), so
// the UI shows the backend's own plain-language message rather than
// inventing its own wording per screen.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
  formData?: FormData;
  anonymous?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!options.anonymous) {
    const token = session.get()?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: options.method ?? "GET", headers, body });
  } catch {
    throw new ApiError(0, "network_unreachable", "The backend is not reachable. Is it running?");
  }

  if (response.status === 401) {
    session.clear();
    throw new ApiError(401, "session_expired", "Session expired, please log in again.");
  }

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const shape = (payload ?? {}) as { reason?: string; message?: string };
    throw new ApiError(response.status, shape.reason ?? "unknown_error", shape.message ?? "Request failed.");
  }

  return payload as T;
}

// Login is the one anonymous call, and docs/17 §2 returns role/expiry beside
// the token precisely so the shell doesn't have to decode a JWT to route.
export async function login(username: string, password: string): Promise<{ token: string; role: string; expires_at: string }> {
  return api("/auth/login", { method: "POST", body: { username, password }, anonymous: true });
}

// Binary reads need the same bearer token every other call carries, but not
// JSON parsing -- the evidence route serves the stored certificate itself
// (ADR-CT-034), and re-hashing it is the caller's job, not this function's.
export async function apiBytes(path: string): Promise<{ bytes: Uint8Array; contentType: string | null; ledgerHash: string | null }> {
  const token = session.get()?.token;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401) {
    session.clear();
    throw new ApiError(401, "session_expired", "Session expired, please log in again.");
  }
  if (!response.ok) {
    // Errors from this route are still reason-coded JSON (docs/17 §14).
    const shape = (await response.json().catch(() => ({}))) as { reason?: string; message?: string };
    throw new ApiError(response.status, shape.reason ?? "unknown_error", shape.message ?? "Request failed.");
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
    ledgerHash: response.headers.get("x-evidence-sha256"),
  };
}
