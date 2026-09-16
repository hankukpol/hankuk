import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

// Independent runtime: no .env files, production URLs, existing mock store, or server takeover.
const root=process.cwd(), workspace=path.join(root,'.local','exam-preview'), runtime=path.join(workspace,`runtime-${randomUUID().slice(0,8)}`);
fs.mkdirSync(runtime,{recursive:true});
console.log(`Preparing isolated runtime: ${runtime}`);
function copy(source,destination) {
 if(fs.statSync(source).isDirectory()) {fs.mkdirSync(destination,{recursive:true});for(const name of fs.readdirSync(source))copy(path.join(source,name),path.join(destination,name));}
 else fs.copyFileSync(source,destination);
}
for(const name of ['app','components','lib','public','prisma','scripts','tests','docs','package.json','middleware.ts','next.config.mjs','tsconfig.json','tailwind.config.ts','postcss.config.mjs','postcss.config.js','next-env.d.ts','.eslintrc.json']) {
 const source=path.join(root,name);if(fs.existsSync(source))copy(source,path.join(runtime,name));
}
fs.symlinkSync(path.join(root,'node_modules'),path.join(runtime,'node_modules'),'junction');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(path|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|programdata|home|number_of_processors)$/i.test(key)));
const mockDir=path.join(runtime,'review-state');
Object.assign(env,{NODE_ENV:'development',MOCK_MODE:'true',MOCK_DB_DIR:mockDir,EXAM_ANALYSIS_PREVIEW:'true',NEXT_TELEMETRY_DISABLED:'1',APP_SESSION_SECRET:randomUUID()+randomUUID(),NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-only',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',DATABASE_URL:'postgresql://test:test@127.0.0.1:9/test',DIRECT_URL:'postgresql://test:test@127.0.0.1:9/test'});
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const baseUrl=`http://127.0.0.1:${port}`;env.NEXT_PUBLIC_APP_URL=baseUrl;
const seed=spawnSync(process.execPath,['--import','tsx','scripts/fixtures/exam-preview.ts'],{cwd:runtime,env,stdio:'inherit'});
if(seed.status!==0){console.error(seed.error??`Fixture process exited ${seed.status} (${seed.signal})`);process.exit(seed.status??1);}
const learningSeed=spawnSync(process.execPath,['--import','tsx','scripts/fixtures/exam-learning.ts'],{cwd:runtime,env,stdio:'inherit',windowsHide:true});
if(learningSeed.status!==0){console.error(learningSeed.error??`Learning fixture process exited ${learningSeed.status}`);process.exit(learningSeed.status??1);}
const log=fs.openSync(path.join(runtime,'server.log'),'a');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{cwd:runtime,env,stdio:['ignore',log,log]});
fs.writeFileSync(path.join(workspace,'runtime.json'),JSON.stringify({runtime,baseUrl,pid:server.pid,mockDir,fixtureOnly:true},null,2));
console.log(JSON.stringify({baseUrl,runtime,fixtureOnly:true}));
await once(server,'exit');fs.closeSync(log);
