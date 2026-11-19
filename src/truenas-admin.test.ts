import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// D-0027: destructive TrueNAS calls refuse to run without --confirmed, before connecting.
const run = (...args: string[]) =>
  spawnSync(process.execPath, ['deploy/nas/admin/truenas.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, TRUENAS_HOST: '127.0.0.1:9', TRUENAS_API_KEY: '', TRUENAS_CERT_SHA256: '' },
    timeout: 20000,
  });

describe('deploy/nas/admin/truenas.mjs', () => {
  it.each([
    'pool.dataset.delete', 'app.delete', 'zfs.snapshot.create', 'user.update', 'api_key.create',
    'system.reboot', 'update.update', 'filesystem.put', 'interface.commit', 'system.general.update',
  ])('refuses %s without --confirmed', (method) => {
    const r = run(method, '[]');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/ask Sander/);
  });

  it.each(['system.info', 'app.query', 'app.redeploy', 'app.update', 'app.upgrade', 'app.stop', 'pool.dataset.query'])(
    'lets %s through to the connection',
    (method) => {
      const r = run(method, '[]');
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Can't reach/);
    },
  );
});
