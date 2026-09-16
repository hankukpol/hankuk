/** Audit an already-built isolated runtime with installed full Chrome, then stop only this audit server. */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const info=JSON.parse(fs.readFileSync('.local/exam-preview/runtime.json','utf8'));
if(!info.fixtureOnly)throw Error('Isolated fixture runtime required');
const evidence=path.resolve(process.argv[3]??'.superloopy/evidence/frontend/2026-09-16-exam-preview-reference');
fs.mkdirSync(evidence,{recursive:true});
const packageRoot=process.argv[2];if(!packageRoot)throw Error('Pass the local lighthouse package directory');
const {default:lighthouse}=await import(pathToFileURL(path.resolve(packageRoot,'core/index.js')).href);
const {default:desktopConfig}=await import(pathToFileURL(path.resolve(packageRoot,'core/config/desktop-config.js')).href);
const require=createRequire(path.resolve(packageRoot,'package.json'));
const chromeLauncher=await import(pathToFileURL(require.resolve('chrome-launcher')).href);
console.log('Lighthouse modules loaded');
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const baseUrl=`http://127.0.0.1:${port}`;
console.log('Audit port',port);
const mockDir=path.join(info.runtime,`perf-state-${randomUUID().slice(0,8)}`);fs.mkdirSync(mockDir);fs.copyFileSync(path.join(info.mockDir,'mock-db.json'),path.join(mockDir,'mock-db.json'));
if(fs.existsSync(path.join(info.mockDir,'learning'))){fs.mkdirSync(path.join(mockDir,'learning'));for(const name of fs.readdirSync(path.join(info.mockDir,'learning')).filter(n=>n.endsWith('.json')))fs.copyFileSync(path.join(info.mockDir,'learning',name),path.join(mockDir,'learning',name));}
console.log('Isolated audit fixture copied');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(path|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|programdata|home|number_of_processors)$/i.test(key)));
Object.assign(env,{NODE_ENV:'production',MOCK_MODE:'true',MOCK_DB_DIR:mockDir,NEXT_DIST_DIR:'.next-build-preview',EXAM_ANALYSIS_PREVIEW:'true',NEXT_TELEMETRY_DISABLED:'1',APP_SESSION_SECRET:randomUUID()+randomUUID(),NEXT_PUBLIC_APP_URL:baseUrl,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-only',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',DATABASE_URL:'postgresql://test:test@127.0.0.1:9/test',DIRECT_URL:'postgresql://test:test@127.0.0.1:9/test'});
const log=fs.openSync(path.join(info.runtime,'perf-server.log'),'a');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:info.runtime,env,stdio:['ignore',log,log],windowsHide:true});
let chrome;
try {
 for(let i=0;i<60;i++){try{await fetch(baseUrl);break;}catch{await new Promise(r=>setTimeout(r,500));}}
 console.log('Production server ready');
 const fixture=JSON.parse(fs.readFileSync(path.join(info.mockDir,'manifest.json'),'utf8'))[0];
 const login=await fetch(baseUrl+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:fixture.adminEmail,password:'local-preview'})});
 if(!login.ok)throw Error('Audit login failed');
 const cookies=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 console.log('Authenticated; launching Chrome');
 chrome=await chromeLauncher.launch({chromePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',chromeFlags:['--headless=new','--no-sandbox']});
 const output=[];
 for(const kind of ['regular','morning']) for(const formFactor of ['mobile','desktop']) for(let i=1;i<=3;i++) {
  const query=kind==='regular'?`kind=regular&examTypeId=${process.env.EXAM_LEARNING_QA==='true'?'preview-police-monthly':fixture.regularTypeId}&examDate=${fixture.to}`:`kind=morning&examTypeId=${fixture.morningTypeId}&from=2026-09-08&to=${fixture.to}`;
  const url=`${baseUrl}/police/admin/exams/preview/students/${fixture.studentId}?${query}`;
  const options={port:chrome.port,output:'json',logLevel:'error',onlyCategories:['performance','accessibility','best-practices','seo'],extraHeaders:{Cookie:cookies},disableStorageReset:true};
  const result=await lighthouse(url,options,formFactor==='desktop'?desktopConfig:undefined);
  if(result.lhr.configSettings.formFactor!==formFactor)throw Error('Audit viewport configuration mismatch');
  if(result.lhr.finalDisplayedUrl.includes('/login'))throw Error('Audit measured login instead of report');
  fs.writeFileSync(path.join(evidence,`lighthouse-${kind}-${formFactor}-${i}.json`),result.report);
  const scores=Object.fromEntries(Object.entries(result.lhr.categories).map(([key,value])=>[key,Math.round(value.score*100)]));
  const issues=Object.entries(result.lhr.audits).filter(([,audit])=>audit.score!==null&&audit.score<1).map(([id,audit])=>({id,title:audit.title,score:audit.score}));
  output.push({kind,formFactor,run:i,scores,issues});console.log(JSON.stringify({kind,formFactor,run:i,scores}));
 }
 fs.writeFileSync(path.join(evidence,'performance.json'),JSON.stringify({fixtureOnly:true,productionBuild:true,chrome:'installed full Chrome',results:output},null,2));
} finally {
 if(chrome)await chrome.kill();
 server.kill('SIGTERM');await once(server,'exit');fs.closeSync(log);
}
