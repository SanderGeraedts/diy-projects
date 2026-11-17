---
id: T-0021
title: "Prepare the repository to go public under MIT"
description: "Once v1 works, make the deploy docs generic, check the history for secrets, tailnet names and real photos, add the MIT licence and a README, and turn on branch protection."
status: Open
guarded: true
depends_on: [T-0025, T-0002, T-0004, T-0005, T-0007, T-0008, T-0009, T-0010, T-0011, T-0012, T-0014, T-0015, T-0016, T-0017, T-0018, T-0019]
decisions: [D-0005, D-0010, D-0018, D-0017]
raised_on: 2026-11-17
done_on: ""
result: []
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
- After Sander makes the repo public: branch protection on `main` (required CI check,
  code-owner review), per D-0017.

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
