import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseDesignTokens, scanContent } from 'file:///D:/Codex/home/skills/superloopy-frontend/scripts/ds-compliance.mjs';

const files = [
  'src/app/(staff)/scan/page.tsx',
  'src/app/(staff)/scan/qr-distribution-panel.tsx',
  'src/app/(staff)/scan/quick-distribution-panel.tsx',
  'src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client.tsx',
  'src/app/(admin)/dashboard/courses/[id]/students/students-matrix-panel.tsx',
];
const tokens = parseDesignTokens(readFileSync('DESIGN.md', 'utf8'));
const signatures = (text, file) => scanContent(text, tokens, file)
  .map(({ kind, value }) => `${kind}:${value}`).sort();
const results = files.map(file => {
  const before = signatures(execFileSync('git', ['show', `HEAD:apps/class-pass/${file}`], { encoding: 'utf8' }), file);
  const after = signatures(readFileSync(file, 'utf8'), file);
  const remaining = [...before];
  const added = after.filter(value => {
    const index = remaining.indexOf(value);
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
  return { file, before, after, unchanged: JSON.stringify(before) === JSON.stringify(after), added, removed: remaining };
});
const result = {
  purpose: 'Scoped functional fixes: compare existing style violations without claiming full design-system compliance',
  fullFilePass: results.every(row => row.after.length === 0),
  unchangedViolationLists: results.every(row => row.unchanged),
  noNewViolations: results.every(row => row.added.length === 0),
  results,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.noNewViolations ? 0 : 1;
