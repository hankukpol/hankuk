import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apps = JSON.parse(fs.readFileSync(path.join(root, 'docker/apps.json'), 'utf8'));
const services = {};
for (const [app, settings] of Object.entries(apps)) {
  if (settings.standalone) continue;
  const appPath = `apps/${app}`;
  const target = `/workspace/${appPath}`;
  const watches = [];
  for (const dir of ['src', 'app', 'components', 'lib', 'public', 'prisma', 'scripts', 'tests']) {
    if (fs.existsSync(path.join(root, appPath, dir))) watches.push({
      action: 'sync', path: `${appPath}/${dir}`, target: `${target}/${dir}`, initial_sync: true,
      ignore: ['node_modules/', '.env*', '.local/', '.mock-db/', '*.log', '*.tsbuildinfo', '__*'],
    });
  }
  for (const file of fs.readdirSync(path.join(root, appPath))) {
    if (/^(next\.config\.|tsconfig.*\.json$|postcss\.config\.|tailwind\.config\.|eslint\.config\.|\.eslintrc|middleware\.|prisma\.config\.)/.test(file)) {
      watches.push({ action: 'sync+restart', path: `${appPath}/${file}`, target: `${target}/${file}` });
    }
  }
  watches.push({ action: 'rebuild', path: `${appPath}/package.json` }, { action: 'rebuild', path: 'pnpm-lock.yaml' },
    { action: 'sync+restart', path: 'packages/config', target: '/workspace/packages/config', ignore: ['node_modules/'] });
  services[app] = {
    image: `hankuk-${app}-dev:local`,
    build: { context: '.', dockerfile: 'docker/Dockerfile.dev', args: { APP: app } },
    init: true,
    profiles: [app],
    ports: [`127.0.0.1:${settings.port}:${settings.port}`],
    env_file: [`docker/environments/${app}.env.local`],
    environment: { NODE_ENV: 'development', PORT: String(settings.port), WATCHPACK_POLLING: 'true', NEXT_TELEMETRY_DISABLED: '1' },
    extra_hosts: ['host.docker.internal:host-gateway'],
    develop: { watch: watches },
    healthcheck: {
      test: ['CMD', 'node', '-e', `fetch('http://127.0.0.1:${settings.port}${settings.path}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`],
      interval: '30s', timeout: '25s', start_period: '120s', retries: 5,
    },
  };
}
fs.writeFileSync(path.join(root, 'compose.dev.json'), JSON.stringify({ name: 'hankuk-dev', services }, null, 2) + '\n');
console.log(`Configured ${Object.keys(services).length} apps plus standalone study-hall.`);
