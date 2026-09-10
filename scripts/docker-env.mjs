import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apps = JSON.parse(fs.readFileSync(path.join(root, 'docker/apps.json'), 'utf8'));
const statusCache = new Map();
function status(workdir, port) {
  if (statusCache.has(port)) return statusCache.get(port);
  const result = spawnSync('supabase', ['status', '--workdir', workdir, '-o', 'env'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Local Supabase on port ${port} must be started first. No environment files changed for this service.`);
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  const api = new URL(values.API_URL);
  if (!['127.0.0.1', 'localhost'].includes(api.hostname) || Number(api.port) !== port) throw new Error('Refusing non-local Supabase.');
  const db = new URL(values.DB_URL);
  if (!['127.0.0.1', 'localhost'].includes(db.hostname)) throw new Error('Refusing non-local database.');
  statusCache.set(port, values);
  return values;
}
fs.mkdirSync(path.join(root, 'docker/environments'), { recursive: true });
for (const [app, config] of Object.entries(apps)) {
  if (config.standalone) continue;
  const destination = path.join(root, `docker/environments/${app}.env.local`);
  if (fs.existsSync(destination)) { console.log(`${app}: preserved existing local environment`); continue; }
  const local = status(config.apiPort ? path.join(root, 'apps', app) : root, config.apiPort ?? 54331);
  const db = new URL(local.DB_URL); db.hostname = 'host.docker.internal';
  if (config.schema) db.searchParams.set('schema', config.schema);
  const origin = `http://localhost:${config.port}`;
  const secret = () => randomBytes(32).toString('hex');
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    SUPABASE_URL: local.API_URL.replace('127.0.0.1', 'host.docker.internal'),
    DATABASE_URL: db.toString(), DIRECT_URL: db.toString(), NEXT_PUBLIC_APP_URL: origin,
    COOKIE_DOMAIN: '', JWT_SECRET: secret(), QR_HMAC_SECRET: secret(), PORTAL_JWT_SECRET: secret(),
    ADMIN_SESSION_SECRET: secret(), NEXTAUTH_SECRET: secret(), NEXTAUTH_URL: origin,
    PORTAL_ORIGIN: 'http://localhost:3400', PORTAL_URL: 'http://localhost:3400', NEXT_PUBLIC_PORTAL_URL: 'http://localhost:3400',
    PORTAL_ALLOWED_ORIGINS: Object.values(apps).map(s => `http://localhost:${s.port}`).join(','),
    PORTAL_PREFER_CUSTOM_DOMAINS: 'false',
    SCORE_PREDICT_POLICE_ORIGIN: 'http://police.localhost:3200', SCORE_PREDICT_FIRE_ORIGIN: 'http://fire.localhost:3200',
    SUPABASE_STORAGE_BUCKET: 'uploads',
  };
  for (const [name, value] of Object.entries(apps)) env[`PORTAL_TARGET_${name.replaceAll('-', '_').toUpperCase()}_URL`] = `http://localhost:${value.port}`;
  if (config.mock) Object.assign(env, { LOCAL_DEV_MODE: 'mock', NEXT_PUBLIC_LOCAL_DEV_MODE: 'mock', LOCAL_DEV_ADMIN_ID: '00000000-0000-0000-0000-000000000001', LOCAL_DEV_ADMIN_EMAIL: 'local-admin@morningmock.local' });
  fs.writeFileSync(destination, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  console.log(`${app}: local-only environment created (values hidden)`);
}
