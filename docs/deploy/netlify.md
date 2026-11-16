# Setting up Netlify

The front end runs on Netlify at `projects.sanderg.nl` (D-0005). The build settings live in
[`netlify.toml`](../../netlify.toml); these are the one-off steps in the Netlify and DNS
dashboards.

1. **Create the site.** Netlify → *Add new site* → *Import an existing project* → GitHub →
   grant the Netlify app access to `SanderGeraedts/diy-projects` → pick the repo. Leave
   the build settings empty; `netlify.toml` provides them. Production branch: `main`.
2. **Deploy previews.** *Site configuration → Build & deploy → Deploy Previews*: on for
   every pull request. Branch deploys: off.
3. **Domain.** *Domain management → Add a domain* → `projects.sanderg.nl`, then add the
   CNAME record Netlify shows at the DNS provider for `sanderg.nl`. Netlify issues the
   certificate.
4. **PocketBase address — only when the sync task needs it.** *Site configuration →
   Environment variables → Add* `POCKETBASE_URL`, with **Scopes: Builds** and **Deploy
   contexts: Production only**. Never give it a value for Deploy Previews, Branch deploys
   or Local development (D-0006). The build ignores it outside production regardless.

## Checking a preview

A PR's preview shows the yellow "Demo data · sync is off (deploy-preview)" bar and the
seeded demo projects. In Chrome on the phone, *Add to home screen* → *Install* should offer
an app install, and the app should open with the network off after the first load.
