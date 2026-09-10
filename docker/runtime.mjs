import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.platform !== 'linux') throw new Error('Run this entrypoint inside Docker.');
// Browser and server both use localhost URLs; forward only the selected local API port.
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!['localhost', '127.0.0.1'].includes(api.hostname)) throw new Error('Local Supabase URL required.');
const proxy = spawn('socat', [`TCP-LISTEN:${api.port},bind=127.0.0.1,fork,reuseaddr`, `TCP:host.docker.internal:${api.port}`], { stdio: 'inherit' });
if (existsSync('prisma/schema.prisma')) {
  const result = spawnSync('pnpm', ['exec', 'prisma', 'generate'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (existsSync('scripts/fix-prisma-default-entry.cjs')) {
    const fix = spawnSync(process.execPath, ['scripts/fix-prisma-default-entry.cjs'], { stdio: 'inherit' });
    if (fix.status !== 0) process.exit(fix.status ?? 1);
  }
}
const args = process.argv.slice(2);
const command = args.length ? args : ['exec', 'next', 'dev', '--hostname', '0.0.0.0', '--port', process.env.PORT, ...(process.env.HANKUK_APP === 'score-predict' ? ['--webpack'] : [])];
const child = spawn('pnpm', command, { stdio: 'inherit' });
// `docker stop` ends the dev server by signal, which leaves no exit code; that stop was asked for, so it is a success.
// One-off commands (check/exec) keep their own code: an interrupted check must not read as passed.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; child.kill(signal); proxy.kill(signal); });
child.on('error', error => { console.error(error.message); proxy.kill(); process.exit(1); });
child.on('exit', code => { proxy.kill(); process.exit(stopping && !args.length ? 0 : code ?? 1); });
