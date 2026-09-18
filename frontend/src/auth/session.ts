// Session handling per docs/10_ui_flow_navigation.md §7: one JWT, no
// "stay logged in" option, expiry lands the user back on the login screen
// with a plain message. sessionStorage (not localStorage) is what makes the
// "closing the tab ends the session" behaviour true rather than stated.
export type Role =
  | "ingredient_qa"
  | "production_qa"
  | "compliance_officer"
  | "export_officer"
  | "brand_owner"
  | "system_admin";

export interface Session {
  token: string;
  role: Role;
  expiresAt: string;
}

const STORAGE_KEY = "halcheck.session";
const EXPIRED_KEY = "halcheck.sessionExpired";

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): Session | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.setItem(EXPIRED_KEY, "1");
      return null;
    }
    return session;
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

let current = read();

function emit(): void {
  for (const listener of listeners) listener();
}

export const session = {
  get(): Session | null {
    // Re-read on every access so an expiry that happens while the tab sits
    // open is noticed on the next render, not only on the next reload.
    const latest = read();
    if (latest?.token !== current?.token) current = latest;
    return current;
  },
  set(next: Session): void {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.sessionStorage.removeItem(EXPIRED_KEY);
    current = next;
    emit();
  },
  clear(): void {
    window.sessionStorage.removeItem(STORAGE_KEY);
    current = null;
    emit();
  },
  expiredMessagePending(): boolean {
    return window.sessionStorage.getItem(EXPIRED_KEY) === "1";
  },
  clearExpiredMessage(): void {
    window.sessionStorage.removeItem(EXPIRED_KEY);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const ROLE_LABELS: Record<Role, string> = {
  ingredient_qa: "Ingredient QA",
  production_qa: "Production QA",
  compliance_officer: "Compliance Officer",
  export_officer: "Export/Logistics Officer",
  brand_owner: "Brand Owner",
  system_admin: "System Admin",
};
