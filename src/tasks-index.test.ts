import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// D-0024: the task index is generated from the task files, and every task's status,
// done_on and Log agree. Runs in `pnpm test`, so CI fails when they drift.
describe('docs/tasks', () => {
  it('index is in step with the task files', () => {
    let output = '';
    try {
      output = execFileSync(process.execPath, ['scripts/tasks-index.mjs', '--check'], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      const err = e as { stderr?: string };
      throw new Error(err.stderr || String(e));
    }
    expect(output).toMatch(/index in step/);
  });
});
