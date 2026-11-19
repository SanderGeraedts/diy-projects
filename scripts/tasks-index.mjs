#!/usr/bin/env node
// Generates docs/tasks/index.md from the task files' front matter (D-0024).
//   pnpm run tasks:index          rewrite the index
//   pnpm run tasks:index --check  fail if the index or a task file is out of step
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'tasks');
const STATUSES = ['Open', 'Doing', 'Done', 'Dropped'];

const field = (fm, name) => {
  const m = fm.match(new RegExp(`^${name}:\s*(.*)$`, 'm'));
  if (!m) return undefined;
  const v = m[1].replace(/\s+#.*$/, '').trim();
  return v.startsWith('"') ? JSON.parse(v) : v;
};

export function readTasks() {
  const problems = [];
  const tasks = readdirSync(dir)
    .filter((f) => /^T-\d{4}-.*\.md$/.test(f))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      const t = {
        file,
        id: field(fm, 'id'),
        title: field(fm, 'title'),
        description: field(fm, 'description'),
        status: field(fm, 'status'),
        doneOn: field(fm, 'done_on'),
        log: (text.split(/^# Log\s*$/m)[1] ?? '').split('\n').filter((l) => l.startsWith('- ')),
      };
      if (!file.startsWith(`${t.id}-`)) problems.push(`${file}: id ${t.id} doesn't match the file name`);
      if (!STATUSES.includes(t.status)) problems.push(`${file}: status "${t.status}" isn't ${STATUSES.join('/')}`);
      if (t.status === 'Done' && !/^\d{4}-\d{2}-\d{2}$/.test(t.doneOn ?? ''))
        problems.push(`${file}: Done but done_on is empty`);
      if (t.status !== 'Done' && t.doneOn) problems.push(`${file}: done_on is set but status is ${t.status}`);
      if ((t.status === 'Done' || t.status === 'Doing') && t.log.length === 0)
        problems.push(`${file}: ${t.status} but the Log is empty`);
      return t;
    });
  return { tasks, problems };
}

export function renderIndex(tasks) {
  const head = `# Tasks

Generated from the task files by \`pnpm run tasks:index\`; don't edit by hand (D-0024).
One file per task (D-0008), from [_template.md](_template.md). Pick from *Open* a task whose
\`depends_on\` are all Done. One task per session.
`;
  const sections = STATUSES.map((s) => {
    const rows = tasks.filter((t) => t.status === s);
    const body = rows.length
      ? rows.map((t) => `- [${t.id} ${t.title}](${t.file}): ${t.description}`).join('\n')
      : 'None.';
    return `## ${s}\n\n${body}\n`;
  });
  return [head, ...sections].join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { tasks, problems } = readTasks();
  const want = renderIndex(tasks);
  const indexPath = join(dir, 'index.md');
  if (process.argv.includes('--check')) {
    const have = readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
    if (have !== want) problems.push('docs/tasks/index.md is out of step with the task files: run pnpm run tasks:index');
    if (problems.length) {
      console.error(problems.map((p) => `✗ ${p}`).join('\n'));
      process.exit(1);
    }
    console.log(`✓ ${tasks.length} tasks, index in step`);
  } else {
    if (problems.length) console.warn(problems.map((p) => `! ${p}`).join('\n'));
    writeFileSync(indexPath, want);
    console.log(`wrote docs/tasks/index.md (${tasks.length} tasks)`);
  }
}
