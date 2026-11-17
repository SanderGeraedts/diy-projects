# Can the repository go public? (T-0025)

Scanned on 2026-11-17, before T-0021. This report only looks; nothing else was changed.

## Summary

- **No secrets found.** gitleaks 8.30.1 (`gitleaks detect --source . --log-opts="--all"`):
  82 commits scanned (every non-merge commit on every ref), ~1.14 MB, **no leaks found**.
  The same scan of the working tree (`--no-git`) is also clean. Nothing needs rotating.
- **Scope:** all 101 commits in the clone (`git rev-list --all`; 89 reachable from the
  remote), 23 remote branches (main, 14 unmerged ones each with an open draft PR, 8 merged but
  not deleted), the local-only branches as well, and the titles, bodies and comments of all 33
  PRs (open and closed).
- **Targeted searches** over the full patch history (`git log --all -p --cc`) and the PRs:
  `*.ts.net`, `/mnt/`, IPv4 addresses, `tskey-`, passwords/tokens/keys, `.env` files, email
  addresses (content and commit metadata), names, Fugro/work references, Netlify site ids
  and UUIDs, `sanderg.nl`, `SanderGeraedts`, GHCR names, and every image blob ever committed.
- **Counts:** 2 **blocker**, 6 **decide**, 13 **fine**.

## Blockers

| # | Where | What | Fix |
|---|---|---|---|
| B1 | `.github/workflows/backend.yml:50` and `deploy/nas/smoke-test.sh:8` (main, since 63c1f3b); `.github/workflows/ci.yml` (`--origins`, 973d875, on branches t-0015/t-0016/t-0018); `deploy/nas/compose.yml:44` and `deploy/nas/README.md` (f220c17, branch t-0014-nas, PR #24); `docs/deploy/netlify.md`, `docs/deploy/pocketbase-on-the-nas.md:47` | The domain `projects.sanderg.nl` is hard-coded. D-0010 wants the domain as configuration before going public. | Edit (T-0021): take the origin from configuration (`APP_ORIGIN` in `.env`/compose, a variable in the workflows; the CI ones can use any test origin) and write `<your-domain>` in the deploy docs. No history rewrite: the domain is public already. Decision records keep the name (they record what was decided). |
| B2 | repository root | No `LICENSE`. D-0010 says MIT. | Add MIT `LICENSE` (already in T-0021), with a line that `public/fonts/` is under the OFL (see F10). |

## Decide (Sander's call)

| # | Where | What | Proposed fix |
|---|---|---|---|
| D1 | D-0005, D-0006, D-0007, D-0018 (5479dd4, f8885a2), `docs/deploy/pocketbase-on-the-nas.md:3,215,220` (2961546), T-0013 history (e1b6f2e, 9d6e923), PR #8 body | Another person's name, **Hanna**, and her app (Reading List) on the same NAS, including the 9 November incident where a test copy overwrote her real data and a note that production secrets were pulled onto a laptop. | Edit: "a sister app on the same NAS" or keep "Reading List" without the name, and drop the laptop/secrets sentence. History: leave (low harm) or rewrite if Hanna prefers not to be named. Editing PR #8's body is enough there. |
| D2 | `docs/decisions/D-0001-decisions-live-in-a-registry-in-the-repo.md:18` (9f9a570, main) | A colleague's name and a work project: "The VirGeo harness (Ian Walters)". | Edit to "a harness at work" or drop the name; ask Ian if it stays. History rewrite only if it must disappear completely. |
| D3 | `docs/decisions/D-0010-private-personal-repo-mit-later.md` (5479dd4), T-0025 task text | Employer named ("not the Fugro one") and "switch back to the work account". | Fine to keep (no detail beyond the name), or edit to "the work account". |
| D4 | Author/committer of every commit; `AGENTS.md`, D-0010, older `CLAUDE.md` text | Personal email `sandergeraedts@live.nl` as author (and committer, except GitHub's merge commits) of every commit, plus 7 mentions in files. | Keep (it is the intended identity, D-0010), or switch future commits to the GitHub noreply address and rewrite history with `git filter-repo --mailmap` before going public (rewrites every SHA; open PRs need rebasing). |
| D5 | D-0016, D-0018, Q-005 (e5d93aa, f8885a2), `deploy/nas/README.md`, `docs/deploy/pocketbase-on-the-nas.md` | Home setup in some detail: TrueNAS SCALE/HexOS NAS, two-disk redundancy, Immich holding the photos, no off-site backup, PocketBase exposed through Tailscale Funnel. | Keep (generic, and useful to self-hosters), or trim D-0016/D-0018 wording about "no backup"; no history rewrite needed. |
| D6 | Remote branches merged into main but not deleted: `d-0011-design-system`, `d-0012-questions-auto-merge`, `d-0020-full-width-accent-bars`, `pnpm`, `t-0001-scaffold`, `t-0003-local-db-for-sync`, `t-0023-local-guard`, `tasks-v1` | Stale branches; their content is already in main (no extra findings). | Delete them before going public (tidiness only). |

## Fine

| # | Where | What | Why it's fine |
|---|---|---|---|
| F1 | whole history | gitleaks: no leaks | Scanner over every ref; working tree clean too. |
| F2 | `deploy/nas/README.md`, `docs/deploy/pocketbase-on-the-nas.md` | `*.ts.net` only as `diy-projects.<tailnet>.ts.net` / `<name>.<tailnet>.ts.net`; `tail1234` as an example | Placeholders only; no real tailnet name anywhere, PRs included. (The production bundle contains the real PocketBase address anyway, D-0005.) |
| F3 | `deploy/nas/compose.yml`, README (t-0014-nas) | `/mnt/POOL/apps/diy-projects` | Marked as the placeholder default to replace. Sander: confirm `POOL` isn't the real pool name (harmless either way). |
| F4 | tests, workflows, Vite config | IPs `127.0.0.1`, `0.0.0.0` only | Loopback/bind addresses. |
| F5 | `deploy/nas/.env.example` (f220c17) | `TS_AUTHKEY=tskey-auth-REPLACE-ME`, `REPO_USER/REPO_PASS=REPLACE-ME` | Placeholders; no real `.env` was ever committed. |
| F6 | `.github/workflows/ci.yml`, `deploy/nas/smoke-test.sh`, `src/auth/*.pocketbase.test.ts`, `src/sync/sync.pocketbase.test.ts` | Fixed password `ci-only-password-123456` | Used only for throwaway CI containers on an empty database; never the NAS (D-0006). |
| F7 | tests | Emails `*@ci.invalid`, `sander@example.invalid` | Reserved `.invalid`/example domains. |
| F8 | old `package-lock.json` (removed when moving to pnpm, D-0019) | `i@izs.me` | npm package metadata of a public package. |
| F9 | `.github/workflows/backend.yml`, `deploy/nas/compose.yml`, `.github/CODEOWNERS`, `AGENTS.md` | `ghcr.io/sandergeraedts/diy-projects-pocketbase`, `@SanderGeraedts` | The account name is the repository's own owner; CODEOWNERS needs it for code-owner review (D-0017). No Netlify site id or other UUID found. |
| F10 | `public/fonts/poppins-latin-*.woff2` + `public/fonts/OFL.txt` (da94464; branch t-0002-design-system and the 12 branches built on it, PR #14) | Third-party font | OFL 1.1, licence text and copyright included. MIT covers the rest; say in `LICENSE`/README that the fonts are OFL (B2). Dependencies are not vendored. |
| F11 | `public/icons/icon-{192,512}.png`, `icon-maskable-512.png` (2 versions each), `icon.svg` (2 versions) | App icons | Drawn by `scripts/make-icons.mjs` / hand-written SVG paths. PNGs have only IHDR/IDAT/IEND chunks: no EXIF, no text. |
| F12 | `e2e/design.spec.ts-snapshots/design-{light,dark}-pixel-linux.png` (8d09a27) | Screenshot baselines | Screenshots of `/design` with generated gradient placeholders and demo data; no metadata chunks. No other image was ever committed. |
| F13 | `.claude/settings.json`, `.githooks/`, `netlify.toml` | Agent settings, hooks, CSP | Deny rules and headers only; CSP uses `https://*.ts.net` on purpose to keep the tailnet name out. |

## Open PRs and branches that go public

14 open draft PRs, all on unmerged branches: #14 t-0002-design-system, #20 t-0011-filters,
#21 t-0019-updates, #22 t-0004-projects, #23 t-0012-search, #24 t-0014-nas, #25
t-0008-viewer, #26 t-0005-entries, #27 t-0015-sign-in, #28 t-0007-import, #29
t-0009-cover-delete, #30 t-0016-sync, #31 t-0010-delete, #33 t-0018-sync-status. Their only
findings are B1 (t-0014-nas, and `ci.yml` on t-0015/t-0016/t-0018) and F10 (fonts). Local-only
branches (`agent-*`, `admin-*`, `raise-q-*`, t-0006, t-0013, t-0017) were scanned too; they
only go public if pushed.
