---
id: T-0021
title: "Prepare the repository to go public under MIT"
description: "Once v1 works, make the deploy docs generic, check the history for secrets, tailnet names and real photos, add the MIT licence and a README, and turn on branch protection."
status: Doing
guarded: true
depends_on: [T-0025, T-0002, T-0004, T-0005, T-0007, T-0008, T-0009, T-0010, T-0011, T-0012, T-0014, T-0015, T-0016, T-0017, T-0018, T-0019]
decisions: [D-0023, D-0010, D-0018, D-0028]
raised_on: 2026-11-17
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/46"]
---

# Goal

D-0010: private until v1 works and the deploy docs are generic, then public under MIT.

- Deploy docs (`docs/deploy/`, `deploy/nas/`) use placeholders for the domain, tailnet and
  account names; the domain comes from configuration.
- Fix what T-0025's report (`docs/public-readiness.md`) lists as a blocker or what Sander
  chose to fix, then re-run its scan over the full history; anything left is removed before
  going public, or Sander decides it's harmless.
- **From T-0025** (`docs/public-readiness.md`): B1, take `projects.sanderg.nl` out of
  `.github/workflows/backend.yml`, `deploy/nas/smoke-test.sh`, `ci.yml` (`--origins`),
  `deploy/nas/compose.yml` and README, and `docs/deploy/*`: an `APP_ORIGIN` setting in
  compose/`.env`, a variable in the workflows (CI may use any test origin), `<your-domain>`
  in docs; decision records keep the name. B2: the MIT `LICENSE` says `public/fonts/` is
  under the OFL. Personal details are already redacted (PR #36, D-0021); D4 (commit email)
  and D5 (NAS details) stay, by Sander's choice.
- `LICENSE` (MIT) and a short `README.md`: what it is, how to run it locally, how to
  self-host it.
- After Sander makes the repo public: branch protection on `main` (required CI check
  `checks`, no review), per D-0028.

# Done when

- The history scan's output is in the PR, with nothing unresolved.
- `LICENSE` and `README.md` exist; the deploy docs have no personal names or addresses.
- Sander makes the repository public and confirms branch protection is on.
- Sander reviews the PR (guarded).

# Notes

- Revisit D-0008 then: outside contributors may suit GitHub Issues better.
- Revisit D-0018 then: self-hosters will expect backup instructions.
- A Dutch-only interface may need revisiting for others (D-0020).

# Log

- 2026-11-19 claude-code/opus-5.5: B1: `projects.sanderg.nl` is out of the workflows,
  `deploy/nas/` and `docs/deploy/`. `compose.yml` takes `--origins=${APP_ORIGIN:?…}` (no
  default, compose refuses to start without it; README step 4 says to fill it in on TrueNAS,
  `.env.example` has it for plain compose); `backend.yml`, `ci.yml` and `smoke-test.sh` use
  `APP_ORIGIN=https://app.example`; the docs say `<your-domain>`. Decision records keep the
  name. `netlify.toml`'s CSP has no domain. B2: MIT `LICENSE` (Sander Geraedts, 2026) with
  `public/fonts/` under the OFL (`public/fonts/OFL.txt`). Short `README.md`.
- 2026-11-19 claude-code/opus-5.5: History scan, on a `git clone --mirror` of GitHub (main,
  d-0026-purge-markers, 45 PR heads: 149 commits) and the local clone (all 19 refs, 147
  commits), plus the titles, bodies and comments of all 45 PRs. gitleaks 8.30.1 `detect
  --log-opts="--all"`: 106 and 105 commits, no leaks; working tree (`--no-git`) no leaks.
  Tailnet: only placeholders and `*.ts.net`; IPs only 127.0.0.1/0.0.0.0; NAS paths only the
  `/mnt/POOL/...` placeholder and `<pool>`; emails: Sander's (D4, kept) and `.invalid`/package
  metadata; 14 image blobs, all generated (icons, screenshot baselines), PNG chunks
  IHDR/IDAT/IEND only, no EXIF, no JPEG/HEIC ever; licences: Poppins OFL, dependencies
  permissive and not vendored. Names redacted by PR #36 remain in old commits and in 3 commit
  messages (D1–D3, history left as is by Sander's choice). Checks: typecheck clean; `pnpm test`
  27 files passed, 3 skipped (332 tests passed, 24 skipped); build ok; `E2E_PORT=4793 pnpm run
  test:e2e` 48 passed, 2 skipped.
- 2026-11-19 claude-code/opus-5.5: To revisit once public (no decision written): D-0008,
  outside contributors may suit GitHub Issues better than task files; D-0018, self-hosters
  will expect backup instructions; D-0020, the Dutch-only interface.
- Superseded by D-0028 (no guarded paths): no review needed; branch protection requires only
  the `checks` status check. Merged by the agent once green.
- Remaining: set `APP_ORIGIN` on the NAS before or at merge (fill
  it into the app's YAML the next time `compose.yml` is pasted, README step 4); make the
  repository public; turn on branch protection on `main` (required CI check `checks`, no
  review), per D-0028.
