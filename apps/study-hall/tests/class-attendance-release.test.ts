import assert from 'node:assert/strict';
import { withDivisionLookup } from "./helpers/division-lookup";
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import * as meta from '../lib/attendance-meta';
import * as dates from '../lib/date-utils';
function fixture(){
 const row=(id:string,status='EXCUSED',reason:string|null='수업: 기본반',studentId='p1',date='2030-10-07',periodId='p')=>({id,status,reason,studentId,date,periodId,updatedAt:'2030-10-01T00:00:00Z',examAutoSource:null as string|null});
 const state={attendanceByDivision:{police:[row('class'),row('present','PRESENT',null,'p2'),row('tardy','TARDY'),row('absent','ABSENT'),row('reason','EXCUSED','병원'),row('no-class','EXCUSED','수업 취소'),row('holiday','HOLIDAY'),row('half','HALF_HOLIDAY'),{...row('exam'),examAutoSource:'MORNING'},row('weekend','EXCUSED','수업','p1','2030-10-06'),row('other-period','EXCUSED','수업','p1','2030-10-07','other'),row('earlier','EXCUSED','수업','p1','2030-10-01')],fire:[row('fire','EXCUSED','수업','f1')]}};
 const dependencies:Record<string,unknown>={ 'node:crypto':crypto,'react':{cache:(f:unknown)=>f},'@/lib/attendance-meta':meta,'@/lib/date-utils':dates,'@/lib/attendance-arrival':{},'@/lib/management-policy':{},'@/lib/server-log':{},'@/lib/services/management-policy.service':{},'@/lib/services/settings.service':{},'@/lib/revalidation':{revalidateDivisionOperationalViews(){}},'@/lib/mock-data':{isMockMode:()=>true},'@/lib/mock-store':{readMockState:async()=>state,updateMockState:async(f:(s:typeof state)=>unknown)=>f(state)},'@/lib/errors':{badRequest:(s:string)=>new Error(s),notFound:(s:string)=>new Error(s)},'@/lib/service-helpers':withDivisionLookup({getPrismaClient:()=>{throw Error('No database in test')}}),'@/lib/services/student.service':{getDivisionStudents:async(slug:string)=>(slug==='police'?['p1','p2']:['f1']).map(id=>({id,seatId:'seat'}))},'@/lib/services/period.service':{getPeriods:async(slug:string)=>[{id:slug==='police'?'p':'fp',isActive:true}]}};
 function load<T>(name:string):T{const code=ts.transpileModule(readFileSync(`lib/services/${name}.service.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',code)((id:string)=>{assert(id in dependencies,`unexpected dependency ${id}`);return dependencies[id]},m,m.exports);return m.exports as T;}
 dependencies['@/lib/services/class-attendance-release.service']=load('class-attendance-release');
 const service=load<typeof import('../lib/services/attendance.service')>('attendance');
 const input={operation:'release-class' as const,studentIds:['p1','p2'],dateFrom:'2030-10-01',dateTo:'2030-10-31',weekdays:[1,2,3,4,5],startPeriodId:'p',endPeriodId:'p',status:'EXCUSED' as const};
 return {state,row,service,input,dependencies,actor:{id:'admin',role:'ADMIN' as const}};
}
test('class release previews without mutation and protects all other statuses, days, periods and tenants',async()=>{const f=fixture();f.input.dateFrom='2030-10-07';const before=structuredClone(f.state);const p=await f.service.applyRecurringAttendance('police',f.actor,{...f.input,preview:true});assert.equal(p.releasedCount,1);assert.deepEqual(f.state,before);await f.service.applyRecurringAttendance('police',f.actor,{...f.input,previewToken:p.previewToken});assert.deepEqual(f.state.attendanceByDivision.police,before.attendanceByDivision.police.filter(r=>r.id!=='class'));assert.deepEqual(f.state.attendanceByDivision.fire,before.attendanceByDivision.fire);const again=await f.service.applyRecurringAttendance('police',f.actor,{...f.input,preview:true});assert.equal(again.releasedCount,0);});
test('class release rejects unreviewed or stale selection including concurrent real attendance',async()=>{const f=fixture();await assert.rejects(f.service.applyRecurringAttendance('police',f.actor,f.input),/다시 확인/);const p=await f.service.applyRecurringAttendance('police',f.actor,{...f.input,preview:true});f.state.attendanceByDivision.police[0].status='PRESENT';const before=structuredClone(f.state);await assert.rejects(f.service.applyRecurringAttendance('police',f.actor,{...f.input,previewToken:p.previewToken}),/다시 확인/);assert.deepEqual(f.state,before);});
test('class release validates students, periods, range and administrator role',async()=>{const f=fixture();for(const change of [{studentIds:['f1']},{startPeriodId:'fp'},{dateTo:'2031-10-01'},{weekdays:[]},{dateFrom:'invalid'}])await assert.rejects(f.service.applyRecurringAttendance('police',f.actor,{...f.input,...change,preview:true}));await assert.rejects(f.service.applyRecurringAttendance('police',{id:'assistant',role:'ASSISTANT'},{...f.input,preview:true}));});
test('class release handles multiple students independently in a second academy',async()=>{const f=fixture();f.state.attendanceByDivision.police.push(f.row('second','EXCUSED','수업: 다른반','p2'));const p=await f.service.applyRecurringAttendance('police',f.actor,{...f.input,preview:true});assert.equal(p.releasedCount,3);f.state.attendanceByDivision.fire[0].periodId='fp';const fire={...f.input,studentIds:['f1'],startPeriodId:'fp',endPeriodId:'fp'};const fp=await f.service.applyRecurringAttendance('fire',f.actor,{...fire,preview:true});assert.equal(fp.releasedCount,1);await f.service.applyRecurringAttendance('fire',f.actor,{...fire,previewToken:fp.previewToken});assert.equal(f.state.attendanceByDivision.fire.length,0);assert(f.state.attendanceByDivision.police.some(r=>r.id==='class'));});

test('past release recalculates without exam attendance rewrite, reports failures and supports empty retry',async()=>{
 const f=fixture(),d=f.dependencies,calls:boolean[]=[];let fail=true;
 Object.assign(d['@/lib/services/management-policy.service'] as object,{getManagementPolicy:async()=>({enabled:true})});
 Object.assign(d['@/lib/management-policy'] as object,{isPolicyEffective:()=>true});
 Object.assign(d['@/lib/services/settings.service'] as object,{getDivisionSettings:async()=>({})});
 Object.assign(d['@/lib/server-log'] as object,{logServerError:()=>{}});
 d['@/lib/services/exam-point.service']={syncExamPoints:async(_s:string,_d:string,_a:string,syncAttendance:boolean)=>{calls.push(syncAttendance)}};
 d['@/lib/services/perfect-attendance.service']={syncPeriodicPerfectAttendancePoints:async()=>({grantedCount:0,revokedCount:0})};
 d['@/lib/services/policy-attendance.service']={applyPolicyAttendancePoints:async()=>{if(fail)throw Error('temporary failure')}};
 f.state.attendanceByDivision.police[0].date='2000-10-02';
 const input={...f.input,dateFrom:'2000-10-02',dateTo:'2000-10-02'};
 const p=await f.service.applyRecurringAttendance('police',f.actor,{...input,preview:true});
 const saved=await f.service.applyRecurringAttendance('police',f.actor,{...input,previewToken:p.previewToken});
 assert.equal(saved.releasedCount,1);assert.equal(saved.automationWarnings?.length,1);assert(!f.state.attendanceByDivision.police.some(r=>r.id==='class'));
 fail=false;const empty=await f.service.applyRecurringAttendance('police',f.actor,{...input,preview:true});
 const retry=await f.service.applyRecurringAttendance('police',f.actor,{...input,previewToken:empty.previewToken});
 assert.equal(retry.releasedCount,0);assert.deepEqual(retry.automationWarnings,[]);assert.deepEqual(calls,[false,false]);
});
