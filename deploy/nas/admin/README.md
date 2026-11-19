# Agent access to the NAS (D-0027)

Agents manage TrueNAS through its API with `truenas.mjs`, as a dedicated admin user, from a
machine on the home LAN. Destructive calls need `--confirmed`, and Claude Code asks Sander
before running any command that contains it.

Nothing here is secret. The host, key and certificate fingerprint live only in Sander's
user environment variables, never in the repository.

## One-time setup (Sander)

1. **A user for the agent.** TrueNAS → **Credentials → Users → Add**:
   - Username `claude-agent`, full name "Claude agent".
   - **Disable password** (it signs in with its API key only), no SMB, no shell access.
   - Group: `builtin_administrators` (full admin, D-0027).
2. **Its API key.** **Credentials → Users → claude-agent → API Keys → Add**. Name it after
   the machine (letters and digits only). Copy the key once; TrueNAS won't show it again.
3. **The certificate fingerprint.** In PowerShell on the laptop, on the home network:

   ```powershell
   $env:TRUENAS_HOST = '<the NAS LAN address>'
   node deploy/nas/admin/truenas.mjs --fingerprint
   ```

   Compare it with the SHA-256 fingerprint the browser shows for the TrueNAS certificate
   (padlock → certificate details). Only continue when they match.
4. **Store the three values** for your Windows user (new terminals pick them up):

   ```powershell
   setx TRUENAS_HOST '<the NAS LAN address>'
   setx TRUENAS_CERT_SHA256 '<the fingerprint from step 3>'
   setx TRUENAS_API_KEY '<the key from step 2>'
   ```

5. Restart the terminal (and Orca/Claude Code), then check:
   `node deploy/nas/admin/truenas.mjs system.info`.

**To revoke:** delete the key, or lock the `claude-agent` user, in the TrueNAS UI. To change
the key: add a new one, `setx` it, delete the old one.

## Use

```sh
node deploy/nas/admin/truenas.mjs system.info
node deploy/nas/admin/truenas.mjs app.query '[[["name","=","diy-projects"]]]'
node deploy/nas/admin/truenas.mjs app.config '["diy-projects"]'
node deploy/nas/admin/truenas.mjs app.redeploy '["diy-projects"]' --job
node deploy/nas/admin/truenas.mjs app.update '["diy-projects", {"custom_compose_config_string": "..."}]' --job
```

Methods are in the TrueNAS API reference for the NAS's version (`/api/docs/` on the NAS).

**Destructive** (refused without `--confirmed`; the list is in `truenas.mjs`): deleting or
overwriting data, datasets, snapshots, disks and apps; anything about users, groups, keys,
certificates, SSH, sign-in, network and the UI's own settings; reboot, shutdown and OS
updates. Ask Sander in chat with exactly what will happen, then rerun with `--confirmed`.

## Limits

- LAN only: from home. If something intercepts TLS (the managed work laptop does on the
  tailnet), the certificate pin refuses to send the key, by design.
- The `--confirmed` prompt is a guard for agents in Claude Code, not a security boundary:
  any program running as Sander can read the key. Keep it on a machine only he uses.
