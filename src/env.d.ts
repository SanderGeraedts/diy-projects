/** Netlify deploy context at build time: production, deploy-preview, branch-deploy or local. */
declare const __DEPLOY_CONTEXT__: string
/** The PocketBase address; empty in every build but production (D-0006). */
declare const __POCKETBASE_URL__: string
