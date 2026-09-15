import assert from "node:assert/strict";
import test from "node:test";
import { academyTemplateSchema, planAcademyConfiguration, configurationRevision } from "../lib/academy-template";
import { commonAcademyTemplate } from "../lib/academy-template-presets";
import { buildPolicyAttendanceCandidates } from "../lib/management-policy";
const today = "2026-09-14";
function example() {
  const config = commonAcademyTemplate(today);
  config.pointRules = [{ id:"late",name:"지각",category:"출결",points:-1,isActive:true,displayOrder:0,description:null }];
  config.settings.tardyPointRuleId = "late";
  const policy = config.settings.managementPolicy!;
  policy.enabled = true; policy.tardyRuleId = "late";
  policy.controlledPeriods = [{periodId:config.periods[0].id,weekdays:[1,2,3,4,5],optional:false}];
  return config;
}
test("templates contain configuration, never student identities or enrollment records", () => {
  assert.ok(academyTemplateSchema.safeParse(example()).success);
  const exported = example() as unknown as Record<string,unknown>;
  exported.students = [{ name:"protected",studentNumber:"private" }];
  assert.equal(academyTemplateSchema.safeParse(exported).success,false);
  const withEnrollment = example();
  Object.assign(withEnrollment.settings.managementPolicy!, {optionalEnrollments:[{studentId:"private"}]});
  assert.equal(academyTemplateSchema.safeParse(withEnrollment).success,false);
});
test("copied configuration remaps references and computes independently for two academies", () => {
  const source = example(), empty = commonAcademyTemplate(today,true);
  const a = planAcademyConfiguration("academy-a",empty,source,{assignedSeatIds:[],enrollments:[]}).after;
  const b = planAcademyConfiguration("academy-b",empty,source,{assignedSeatIds:[],enrollments:[]}).after;
  assert.notEqual(a.periods[0].id,b.periods[0].id);
  assert.notEqual(a.pointRules[0].id,b.pointRules[0].id);
  assert.equal(a.settings.tardyPointRuleId,a.pointRules[0].id);
  assert.equal(b.settings.managementPolicy!.controlledPeriods[0].periodId,b.periods[0].id);
  a.pointRules[0].points = -3;
  b.settings.managementPolicy!.controlledPeriods[0].weekdays = [2];
  const awards = (c: typeof a) => buildPolicyAttendanceCandidates({...c.settings.managementPolicy!,optionalEnrollments:[]},c.periods,[{studentId:"local-student",periodId:c.periods[0].id,status:"TARDY"}],c.pointRules,today,new Date(today+"T18:00:00+09:00"));
  assert.equal(awards(a)[0].points,-3);
  assert.deepEqual(awards(b),[]);
  assert.equal(source.pointRules[0].points,-1);
  assert.equal(b.pointRules[0].points,-1);
});
test("applying an own template retains IDs and protects occupied seats", () => {
  const current = example();
  current.rooms = [{id:"room",name:"자습실",columns:2,rows:1,aisleColumns:[],isActive:true,displayOrder:0}];
  current.seats = [{id:"seat",studyRoomId:"room",label:"1",positionX:1,positionY:1,isActive:true}];
  const draft = structuredClone(current);
  draft.periods[0].startTime = "08:30";
  const planned = planAcademyConfiguration("a",current,draft,{assignedSeatIds:["seat"],enrollments:[]});
  assert.equal(planned.after.periods[0].id,current.periods[0].id);
  assert.deepEqual(planned.after.seats,current.seats);
  draft.seats[0].label = "2";
  assert.throws(()=>planAcademyConfiguration("a",current,draft,{assignedSeatIds:["seat"],enrollments:[]}),/배정/);
  draft.seats = [];
  assert.throws(()=>planAcademyConfiguration("a",current,draft,{assignedSeatIds:["seat"],enrollments:[]}),/배정/);
});
test("reference checks reject foreign or positive penalty rules and invalid time/seat configurations", () => {
  const invalid = example();
  invalid.settings.tardyPointRuleId = "foreign-rule";
  assert.equal(academyTemplateSchema.safeParse(invalid).success,false);
  invalid.settings.tardyPointRuleId = "late"; invalid.pointRules[0].points=5;
  assert.equal(academyTemplateSchema.safeParse(invalid).success,false);
  invalid.pointRules[0].points=-1; invalid.periods[0].endTime="08:00";
  assert.equal(academyTemplateSchema.safeParse(invalid).success,false);
});
test("removing configuration archives rows without deleting identities needed by existing records", () => {
  const current = example(), draft = structuredClone(current);
  draft.periods.pop();
  const planned = planAcademyConfiguration("a",current,draft,{assignedSeatIds:[],enrollments:[]});
  assert.equal(planned.after.periods.length,current.periods.length);
  assert.equal(planned.after.periods.at(-1)!.isActive,false);
  assert.deepEqual(new Set(planned.after.periods.map(p=>p.id)),new Set(current.periods.map(p=>p.id)));
  assert.equal(configurationRevision(current),configurationRevision(structuredClone(current)));
});
