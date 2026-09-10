import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apps = JSON.parse(fs.readFileSync(path.join(root, 'docker/apps.json'), 'utf8'));
const [action = 'status', requested = 'all', ...extra] = process.argv.slice(2);
const selected = requested === 'all' ? Object.keys(apps) : [requested];
if (selected.some(app => !apps[app])) {
  console.error('Unknown or empty app. Available: ' + Object.keys(apps).join(', '));
  process.exit(1);
}
if (!['dev', 'start', 'stop', 'status', 'logs', 'build', 'exec', 'check'].includes(action)) throw new Error('Unknown Docker action.');
const children = [];
function run(args, background = false) {
  if (background) {
    const child = spawn('docker', args, { cwd: root, stdio: 'inherit', windowsHide: true });
    children.push(child);
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { if (code) process.exitCode = code; });
    return;
  }
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const common = selected.filter(app => !apps[app].standalone);
if (common.length) {
  for (const app of common) {
    if (!fs.existsSync(path.join(root, `docker/environments/${app}.env.local`))) {
      throw new Error('Run pnpm docker:setup after starting local Supabase. See docs/DOCKER_DEVELOPMENT.md.');
    }
  }
  const base = ['compose', '-f', 'compose.dev.json'];
  if (action === 'dev') run([...base, 'up', '--build', '--watch', ...common], true);
  if (action === 'start') run([...base, 'up', '-d', '--build', ...common]);
  if (action === 'stop') run([...base, 'stop', ...common]);
  if (action === 'status') run([...base, 'ps', ...common]);
  if (action === 'logs') run([...base, 'logs', '-f', ...common], true);
  if (action === 'build') run([...base, 'build', ...common]);
  if (action === 'exec' || action === 'check') {
    if (common.length !== 1 || (action === 'exec' && !extra.length)) throw new Error('Choose one app and a command.');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps', common[0], 'package.json'), 'utf8'));
    const command = action === 'check' ? (pkg.scripts?.typecheck ? ['run', 'typecheck'] : ['exec', 'tsc', '--noEmit']) : extra;
    // `run` gets no Watch sync; it uses the source baked into the image, so rebuild or it checks old code.
    run([...base, 'run', '--rm', '--no-deps', '--build', common[0], 'node', '/workspace/docker/runtime.mjs', ...command]);
  }
}
if (selected.includes('study-hall')) {
  const base = ['compose', '-f', 'apps/study-hall/compose.yaml'];
  const map = { dev: ['up', '--build'], start: ['up', '-d', '--build'], stop: ['stop', 'dev'], status: ['ps'], logs: ['logs', '-f', 'dev'], build: ['build', 'dev'], check: ['--profile', 'test', 'run', '--rm', 'test'], exec: ['exec', '-T', 'dev', 'pnpm', ...extra] };
  // The test service reuses the dev image and its copy of the source; rebuild it before checking.
  if (action === 'check') run([...base, 'build', 'dev']);
  run([...base, ...map[action]], action === 'dev' || action === 'logs');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const child of children) child.kill(signal);
});
