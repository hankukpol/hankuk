import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as schemas from "../../lib/exam-analysis-schemas";

function route(options: { role?: string; studentId?: string; disabled?: boolean; fail?: boolean } = {}) {
  let calls = 0;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse },
    "@/lib/api-auth": {
      requireApiAuth: async () => options.role === "ADMIN" ? {ok:true,session:{role:"ADMIN"}}
        : {ok:false,error:"거부",status:options.role ? 403 : 401},
      requireStudentApiAuth: async () => options.studentId ? {ok:true,session:{studentId:options.studentId}}
        : {ok:false,error:"로그인 필요",status:401},
    },
    "@/lib/division-feature-guard": { getDivisionFeatureDisabledError: async () => options.disabled ? "비활성" : null },
    "@/lib/exam-analysis-schemas": schemas,
    "@/lib/api-error-response": { toApiErrorResponse: (error: unknown) => NextResponse.json({error:"실패"},{status: error && typeof error === "object" && "issues" in error ? 400 : 500,headers:{"Cache-Control":"private, no-store"}}) },
    "@/lib/services/exam-analysis.service": Object.fromEntries(["getRegularCohortAnalysis","getRegularStudentReport","listRegularSessions"].map(name=>[name, async (...args: unknown[])=>{calls++;if(options.fail)throw new Error("db");return {args};}])),
  };
  const source=readFileSync(new URL("../../lib/exam-analysis-route.ts",import.meta.url),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function("require","module","exports",code)((id:string)=>{assert.ok(id in dependencies,id);return dependencies[id];},module,module.exports);
  return {api:module.exports as typeof import("../../lib/exam-analysis-route"), calls:()=>calls};
}
const request=(query="examTypeId=t&examDate=2026-08-15")=>new NextRequest(`http://localhost/api/a/exams/analysis?${query}`);
test("analysis authorization and feature guard run before loaders; all errors private",async()=>{
  for(const [options,expected] of [[{},401],[{role:"ASSISTANT"},403],[{role:"ADMIN",disabled:true},403]] as const){
    const h=route(options);const response=await h.api.handleRegularAnalysis(request(),"a","cohort");
    assert.equal(response.status,expected);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(h.calls(),0);
  }
});
test("own student report is permitted and another student ID rejected before load",async()=>{
  const h=route({studentId:"me"});
  const denied=await h.api.handleRegularAnalysis(request(),"a","student","other");
  assert.equal(denied.status,403);assert.equal(h.calls(),0);
  const own=await h.api.handleRegularAnalysis(request(),"a","student","me");assert.equal(own.status,200);
  const body=await own.json();assert.deepEqual(body.report.args,["a","t","2026-08-15","me",{role:"STUDENT",studentId:"me"}]);
  assert.equal(own.headers.get("cache-control"),"private, no-store");
});
test("regular query rejects malformed, empty and invalid dates",async()=>{
  const h=route({role:"ADMIN"});
  for(const query of ["","examTypeId=&examDate=2026-08-15","examTypeId=t&examDate=0","examTypeId=t&examDate=2026-02-30","examTypeId=t&examDate=invalid"]){
    assert.equal((await h.api.handleRegularAnalysis(request(query),"a","cohort")).status,400);
  }
  assert.equal(h.calls(),0);
});
test("sessions need no date and service exceptions are contained",async()=>{
  const h=route({role:"ADMIN"});assert.equal((await h.api.handleRegularAnalysis(request("examTypeId=t"),"a","sessions")).status,200);
  const failed=route({role:"ADMIN",fail:true});assert.equal((await failed.api.handleRegularAnalysis(request(),"a","cohort")).status,500);
});
