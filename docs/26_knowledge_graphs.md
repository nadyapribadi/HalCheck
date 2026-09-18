# HALCHECK — Knowledge Graphs (code intelligence tooling)

## Document Control

- Project: HALCHECK
- Repository: `halcheck`
- Scope: the two derived knowledge graphs this repository uses, what each one answers, and when they must be refreshed
- Status: tooling set up and first indexes built (2026-09-19)

## 1. What this is for

Two tools answer questions about this codebase that `rg` alone answers badly — "what calls this?", "what breaks if I change this?", "which execution flows touch the verdict path?":

| Tool | Question it answers | Where its output lives | Refresh command |
|---|---|---|---|
| **GitNexus** | what calls / imports / extends what; which execution flows a symbol sits in; blast radius of a change; route → handler → fetch maps; API response-shape drift | `.gitnexus/` (gitignored) | `npm run graph:index` |
| **graphify** | the same relationships as a traversable document graph, plus community detection over code **and docs** — "what is connected to what, that I would not have thought to ask" | `graphify-out/` (gitignored) | `npm run graph:update` |

Both are **derived artifacts**: they are never a source of truth, never edited by hand, and never committed (`.gitignore` covers `.gitnexus/`, `graphify-out/`, `.claude/`). Deleting either directory costs one rebuild and loses nothing.

## 2. The refresh rule (this is the part worth remembering)

Neither tool is tied to a commit; both are tied to **file content**. Committing changes nothing about them. What matters is whether the graph still describes the files on disk:

| Moment | GitNexus | graphify |
|---|---|---|
| **Before** a commit | No refresh needed — use `detect_changes` (see §4): it maps the uncommitted diff onto the *existing* index and reports affected flows. That is exactly what the index is for. | No refresh needed for reading; if the diff is large, `npm run graph:update` first so queries rank the new code. |
| **After** a commit | **Yes — refresh.** This is the one hard rule: GitNexus reports the index as stale when the working tree moves past the indexed commit, and its own hook is wired to `git commit` / `git merge` for that reason. | Only if you are about to query it (content-hash cached, so a refresh after no changes is ~free). |
| After a refactor that deletes or renames code | `npm run graph:index` (or `--force` for a full rebuild when symbols disappear) | `graphify update . --force` |
| After editing docs only | No refresh (documents are not in the GitNexus graph) | `graphify update .` — or `graphify update ./docs` for the 555-node docs-only graph |
| Fresh clone | `npm run graph:bootstrap` once (regenerates `.gitnexus/run.cjs`), then `npm run graph:index` | `npm run graph:update` |

So the practical loop is: **work → `detect_changes` if you want to know what your diff touches → commit → `npm run graph:refresh`.** `npm run graph:refresh` runs both indexers in one go.

## 3. GitNexus specifics

```bash
npm run graph:bootstrap   # first time in a fresh clone, or if .gitnexus/run.cjs is missing
npm run graph:index       # routine refresh (uses the local runner — see below)
npm run graph:status      # freshness, indexed commit, symbol/edge counts
```

- `--skip-agents-md` is not optional here: without it, `analyze` injects into **AGENTS.md**, and this repository's AGENTS.md is hand-written. `--max-file-size 1024` skips oversized files.
- `analyze` also writes `.claude/` (settings + skill copies). Gitignored, generated, safe to delete.
- **Runner identity matters.** `node .gitnexus/run.cjs` resolves a runner at call time (global `gitnexus`, else `npx`). An index built by one runner and checked by another reports "stale" even when the code is identical — that happened on the first run here (`npx gitnexus@latest analyze` then `run.cjs status` → *stale*). `npm run graph:index` therefore uses the local runner, matching what `graph:status` will check with; `graph:bootstrap` is the npx fallback for a clone that has no runner yet.
- First index of this repo: **2,389 nodes, 5,034 edges, 57 clusters, 130 flows** over 145 covered files.

## 4. Querying it

In an agent session, the GitNexus MCP tools are the interface — `query` (execution flows for a concept), `context` (categorized refs for one symbol), `impact` (blast radius by depth, with a risk verdict), `trace` (shortest path between two symbols), `detect_changes` (git-diff impact: what an uncommitted change touches), `route_map` / `api_impact` / `shape_check` (route ↔ consumer ↔ response-shape), `cypher` (raw graph queries), `explain` / `pdg_query` (taint and dependence layers, only if the index was built with `--pdg`).

From a shell: `node .gitnexus/run.cjs status`, and graphify's own readers work with no assistant at all —

```bash
graphify query "verdict attestation signature"     # BFS over the graph
graphify path "verifyProofBundle" "IntegrityPanelScreen"
graphify explain "RecordVerdict"
```

## 5. Known caveats in *this* repository

- **The root graphify graph is mostly third-party code.** `chaincode/*/vendor` is committed (908 files, Go vendoring), so `graphify update .` reports ~45,900 nodes of which roughly 40,100 come from `chaincode/`. For code questions prefer GitNexus (145 files, no vendor); for documents, `graphify update ./docs` gives a clean 555-node graph written to `docs/graphify-out/`.
- `db/init/*.sql` contributes nothing to the graph unless the SQL grammar is installed: `pip install "graphifyy[sql]"`.
- graphify's parser cannot read `src/engine/index.ts` (it reports a syntax error and extracts no symbols from it). The file is valid — `tsc --noEmit` and `vite build` both pass — so this is a parser limitation, not a defect to fix in the source; it will reappear in every rebuild until the parser supports that syntax.
- Both tools index the working tree, not a commit. Running them mid-refactor describes the mid-refactor state, which is occasionally what you want and usually is not.

## 6. What this does not replace

- `docs/14_developer_setup.md` remains the authority for deploying, testing and running the system; the graphs only describe it.
- `docs/21_decisions.md` remains the authority for *why* the code is shaped this way. A graph tells you that `verifyProofBundle` is called by `IntegrityPanelScreen`; it will never tell you that the reason is ADR-CT-034.
