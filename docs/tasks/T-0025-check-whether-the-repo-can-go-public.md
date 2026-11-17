---
id: T-0025
title: "Check whether the repository can go public"
description: "Audit the whole git history, every branch and the open PRs for secrets, personal and infrastructure details, real photos and licence problems, and write a findings report with a proposed fix for each, so Sander can decide what blocks going public."
status: Doing
guarded: false
depends_on: []
decisions: [D-0005, D-0006, D-0010, D-0016, D-0018]
raised_on: 2026-11-17
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/34"]
---

# Goal

Know, before T-0021, what stands between this repository and going public (D-0010), while
it's still cheap to fix. This task only looks and reports; it changes no code and rewrites
no history. Sander decides each finding; T-0021 carries out the fixes.

Check, across **all of history and every branch** (`git log --all`), not only `main`:

- **Secrets:** tokens, keys, passwords, `.env` files (run `gitleaks detect` over the full
  history, or an equivalent scanner; say which).
- **Infrastructure:** tailnet names (`*.ts.net` other than placeholders), NAS paths and
  hostnames, IP addresses, Netlify site ids, GHCR image names that reveal more than intended.
- **Personal details:** email addresses (including commit authors), names of other people
  (for example in the Reading List lessons), work references (the Fugro account, work
  repositories), anything the decisions record about Sander's home or devices that he may
  not want public.
- **Real photos and media:** every image file ever committed (icons, fixtures, screenshot
  baselines); confirm each is generated, and that no image carries EXIF location.
- **Licences:** third-party files in the repo (Poppins under the OFL, anything vendored)
  and whether the MIT licence can cover the rest.
- **Hard-coded personal configuration:** `projects.sanderg.nl`, `SanderGeraedts`, the
  CODEOWNERS handle, and where D-0010 wants them to become configuration.
- **Open PRs and branches:** findings on unmerged branches count too; they go public with
  the repository unless deleted.

# Done when

- `docs/public-readiness.md` lists every finding with: where (file, commit or branch),
  what it is, severity (**blocker**: must go before public; **decide**: Sander's call;
  **fine**: harmless, with the reason), and a proposed fix (edit, configuration, history
  rewrite, delete a branch).
- The scanner's command and output summary are in the PR, and the report says how many
  commits and branches were scanned.
- Nothing in the repository was changed except the report and this task file.
- Sander has read the report and marked each **decide** item; T-0021 is updated with the
  fixes he chose.

# Notes

- Don't put a found secret's value in the report or the PR; name the file and commit only.
- If a real secret turns up, say so at the top of the report and in the PR: it must be
  rotated whatever happens to the history.

# Log

- 2026-11-17 claude-code/opus-5.5: Scanned all 101 commits, 23 remote branches and 33 PRs. `gitleaks detect --source . --log-opts="--all"` (8.30.1): 82 commits, no leaks; plus targeted searches and a chunk check of all 10 image blobs. Report in `docs/public-readiness.md`: 2 blockers (hard-coded domain, no LICENSE), 6 decide, 13 fine. Waiting for Sander to mark the decide items.
