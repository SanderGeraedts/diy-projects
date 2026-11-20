# Agent access to the NAS (G-0022)

Agents manage TrueNAS through its API with the harness's NAS tool,
`pnpm exec harness nas`, as a dedicated admin user, from a machine on the home LAN. How the
tool works, what it treats as destructive and its examples are in
[the harness's README](https://github.com/SanderGeraedts/harness#the-nas-tool)
(`node_modules/@sandergeraedts/harness/README.md`). Destructive calls need `--confirmed`,
and Claude Code asks Sander before running any command that contains it.

This file holds the setup that is specific to this project. Nothing here is secret. The
host, key and certificate fingerprint live only in Sander's user environment variables,
never in the repository.

## One-time setup (Sander)

1. **A user for the agent.** TrueNAS → **Credentials → Users → Add**:
   - Username `claude-agent`, full name "Claude agent".
   - **TrueNAS Access:** Full Admin. This adds `builtin_administrators` and forces
     **Shell Access** on (greyed out); that's harmless with the password disabled and no SSH.
   - **SSH Access:** off, and leave **Public SSH Key** empty. With SSH on, TrueNAS 25.10
     refuses to save: "/var/empty: the user home directory must be set to a writable path
     located within a data pool."
   - **SMB Access:** off. **Disable Password:** on (it signs in with its API key only).
   - **Home Directory:** a folder on a data pool (TrueNAS 25.10 wants one for admin users);
     nothing is stored there.
2. **Its API key.** **Credentials → Users → claude-agent → API Keys → Add**. Name it after
   the machine (letters and digits only). Copy the key once; TrueNAS won't show it again.
3. **The certificate fingerprint.** In PowerShell on the laptop, on the home network, in
   this repository:

   ```powershell
   $env:TRUENAS_HOST = '<the NAS LAN address>'
   pnpm exec harness nas --fingerprint
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
   `pnpm exec harness nas system.info`.

**To revoke:** delete the key, or lock the `claude-agent` user, in the TrueNAS UI. To change
the key: add a new one, `setx` it, delete the old one.

## This project's app

The TrueNAS app is called `diy-projects`:

```sh
pnpm exec harness nas app.query '[[["name","=","diy-projects"]]]'
pnpm exec harness nas app.config '["diy-projects"]'
pnpm exec harness nas app.redeploy '["diy-projects"]' --job
pnpm exec harness nas app.update '["diy-projects", {"custom_compose_config_string": "..."}]' --job
```

Methods are in the TrueNAS API reference for the NAS's version (`/api/docs/` on the NAS).

- **Snapshots** (G-0023): the app's dataset gets a periodic ZFS snapshot task: every
  hour, kept two weeks. Before another kind of risky change, an extra one costs nothing:
  `pnpm exec harness nas pool.snapshot.create '[{"dataset":"<dataset>","name":"before-<change>"}]'`.
  Creating one runs without asking; deleting, rolling back or cloning one still asks.
- Never touch Immich or the other apps on the NAS unless a task names them.
- Never put the NAS's address, the tailnet name or a pool name in a committed file.
- Record what you changed on the NAS in the task's Log.

## Limits

- LAN only: from home. If something intercepts TLS (the managed work laptop does on the
  tailnet), the certificate pin refuses to send the key, by design.
- The `--confirmed` prompt is a guard for agents in Claude Code, not a security boundary:
  any program running as Sander can read the key. Keep it on a machine only he uses.
