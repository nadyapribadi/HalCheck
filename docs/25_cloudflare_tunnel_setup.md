# HALCHECK — Cloudflare Tunnel Setup (step by step)

How to make this project reachable at a public HTTPS URL from this laptop, with no hosting and no inbound port opened on the router. Written to be followed once, by the operator, from a clean machine.

Two ways, pick one:

- **Named tunnel** (recommended): stable URL like `https://halcheck.your-domain.com`, needs a Cloudflare account *and* a domain added to that account.
- **Quick tunnel** (no account, no domain): random `https://<words>.trycloudflare.com` URL that changes every run. Fine for a one-off walkthrough.

## Prerequisites (named tunnel only)

1. A Cloudflare account (free) — https://dash.cloudflare.com/sign-up
2. A domain you control, added to that account, with its nameservers pointed at Cloudflare. Cloudflare shows two nameserver hostnames; set them at your registrar (where you bought the domain). Propagation is usually minutes, can be up to 24 hours. The domain must show **Active** in the Cloudflare dashboard before the tunnel steps work.

If you do not have a domain, skip to §6 (quick tunnel).

## 1. Install cloudflared

```bash
brew install cloudflared
cloudflared --version
```

## 2. Sign in once

```bash
cloudflared tunnel login
```

This opens a browser: pick the domain you added in the prerequisites and authorise. It writes `~/.cloudflared/cert.pem`. That file is the credential for everything after this — never commit it.

## 3. Create the tunnel

```bash
cloudflared tunnel create halcheck-demo
```

It prints a tunnel ID and writes `~/.cloudflared/<tunnel-id>.json`. Keep both.

## 4. Point a hostname at it

```bash
cloudflared tunnel route dns halcheck-demo halcheck.<your-domain>
```

One hostname is enough: `/api/*` is routed to the backend by path, so there is no need for a second DNS record.

## 5. Write the ingress config

Create `~/.cloudflared/halcheck-demo.yml`:

```yaml
tunnel: halcheck-demo
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  # The backend first, by path: the browser calls the same public origin for
  # both, so no CORS preflight is involved in normal use.
  - hostname: halcheck.<your-domain>
    path: /api/*
    service: http://localhost:3001
  - hostname: halcheck.<your-domain>
    service: http://localhost:5173
  # Everything else is refused -- this is the catch-all that makes the
  # negative-exposure test in docs/14 §11 meaningful.
  - service: http_status:404
```

## 6. Point the app at the public URL (the step people miss)

The browser running the demo is not on this laptop, so `http://localhost:3001` would mean *the viewer's* machine. Three values have to change, and the app must be restarted afterwards:

```bash
# frontend/.env.local  (create it; it is gitignored)
VITE_API_BASE_URL=https://halcheck.<your-domain>/api/v1
VITE_ALLOWED_HOSTS=.trycloudflare.com,.your-domain
```

```bash
# backend/.env
# A list, not one value: the local origin must stay allowed while the tunnel
# is up, or the operator's own browser at localhost:5173 is blocked by CORS
# (ADR-CT-035).
ALLOWED_ORIGIN=http://localhost:5173,https://halcheck.<your-domain>
```

**When the tunnel dies, put the local configuration back.** A quick-tunnel URL is ephemeral, and leaving it in place fails in the least obvious way: `frontend/.env.local` keeps pointing the browser at a host that no longer resolves, so the UI reports "the backend is not reachable" while every `curl` against `localhost:3001` still succeeds — curl does not enforce CORS, and it is not reading Vite's env. The file's own header says it is temporary; delete it (or rename it to `.env.local.disabled-*`, which is gitignored) and restart the frontend dev server, which reads `.env.local` at startup only.

`VITE_ALLOWED_HOSTS` matters because Vite's dev server rejects unknown `Host` headers ("Blocked request. This host is not allowed."). The config already defaults to `.trycloudflare.com`; add your own domain here.

Then restart both:

```bash
cd backend  && npm run dev
cd frontend && npm run dev     # picks up .env.local at start, not on reload
```

## 7. Quick tunnel instead (no account, no domain) — and why the old link died

A quick tunnel needs no Cloudflare account, but it is **ephemeral and single-origin**:

```bash
cloudflared tunnel --url http://localhost:5173
# prints e.g. https://<three-random-words>.trycloudflare.com
```

Two consequences that have each cost this project a broken demo link:

1. **The hostname is new on every run.** It exists only while that `cloudflared`
   process lives, and nothing about it is stable or reusable. When someone asks
   "what is the link?", the answer is whatever the currently running process
   printed — a link remembered from an earlier run is dead, and the hostname is
   not recoverable from the process afterwards (it only ever went to stdout).
   For a link that stays valid, use the named tunnel in §1-§5.
2. **One quick tunnel serves one origin.** A named tunnel can route `/api/*` to
   port 3001 by path (§5), but a quick tunnel cannot — so the browser must
   reach the API through the *same* public origin. `frontend/.env.local` does
   that with a relative base URL, and `frontend/vite.config.ts` proxies `/api`
   to the backend:

```bash
# frontend/.env.local (gitignored)
VITE_API_BASE_URL=/api/v1
VITE_ALLOWED_HOSTS=.trycloudflare.com   # Vite refuses unrecognised Host headers
```

With that in place one link serves the app and the API, same-origin, and **CORS
plays no part** in the tunnel path — which is also why `ALLOWED_ORIGIN` no
longer needs the tunnel hostname for quick-tunnel use (it still does for the
named-tunnel setup in §6, where the browser calls the public origin directly).

Before sharing a quick-tunnel link, run the checks in §6 and in
`docs/14_developer_setup.md` §11: the tunnel must expose the frontend (and the
API behind it) and nothing else — Postgres, MinIO and the Fabric peers stay
bound to `127.0.0.1` and are never routable through it.

## 7. Run it

```bash
cloudflared tunnel run halcheck-demo
```

Open `https://halcheck.<your-domain>` on a phone using mobile data (not Wi-Fi — otherwise you are testing a loop back to your own laptop) and log in with a seeded user from `backend/seeded-users.credentials.local`.

## 8. Quick tunnel instead (no account, no domain)

```bash
cloudflared tunnel --url http://localhost:5173
```

That prints a `https://<random>.trycloudflare.com` URL for the frontend only. The API needs its own quick tunnel:

```bash
cloudflared tunnel --url http://localhost:3001
```

Then set `VITE_API_BASE_URL=https://<api-random>.trycloudflare.com/api/v1`, `ALLOWED_ORIGIN=https://<frontend-random>.trycloudflare.com` and restart. Both URLs change every run, which is why the named tunnel is the better demo path.

## 9. Verify before you share the link

```bash
./scripts/health-check.sh
```

Then run the negative-exposure checks in `docs/14_developer_setup.md` §11 from a device that is **not** on this machine's network: peer (7051), orderer (7050), CA (7054), MinIO console (9001) and PostgreSQL (5432) must all be unreachable, and `https://<host>/api/v1/audit-log` without a System Admin token must return 401/403 — never 200 and never a list of rows.

## 10. When you are done

Stop the tunnel (`Ctrl-C`) — do not leave it running. It is an authenticated path into a laptop whose Fabric network and database hold demo state, and everything in this repository is scoped to a walkthrough, not to hosting.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Dashboard shows the domain as **Pending** | Nameservers not changed at the registrar, or not propagated | Set the two Cloudflare nameservers at your registrar and wait |
| `cloudflared tunnel route dns` says the zone was not found | The domain is not in the account you logged in with | Re-run `cloudflared tunnel login` and pick the right domain |
| Browser shows Cloudflare **error 1033** | No tunnel is running for that hostname | Start `cloudflared tunnel run halcheck-demo`, and check the `tunnel:` name in the yml matches |
| Page loads but every action fails, console shows requests to `localhost:3001` | `VITE_API_BASE_URL` was not set, or the dev server was not restarted | Set it in `frontend/.env.local` and restart `npm run dev` |
| Page shows "Blocked request. This host is not allowed." | Vite's host check, described in §6 | Add the hostname to `VITE_ALLOWED_HOSTS` and restart |
| API calls fail with a CORS error | `ALLOWED_ORIGIN` in `backend/.env` still says `http://localhost:5173` | Set it to the public origin and restart the backend |
| Tunnel works, then everything 502s after a while | One of the local services stopped (laptop slept, Docker restarted) | Re-run `./scripts/health-check.sh`, restart what it flags, then restart the backend |
| Every write returns `503 ledger_unavailable` after a restart | Known limitation, ADR-CT-032 | Restart the backend process |
