import assert from "node:assert/strict";
import test from "node:test";
import { buildExamPointAwards, examPointAutomationSchema, examPointDisplayNote, type ExamPointSource } from "../../lib/exam-point-automation";

const configuration = () => examPointAutomationSchema.parse({enabled:true,effectiveFrom:"2026-09-01",morningStartDate:"2026-09-14",morningWeekdays:[1,3,5],morningAbsenceRuleId:"absence",regularAbsenceRuleId:"regular-absence",morningFirstRuleId:"first",regularFirstRuleId:"first",regularSecondRuleId:"second",regularThirdRuleId:"third",morningMonthlyRuleId:"monthly"});
const source = (): ExamPointSource => ({
  students:[{id:"a",status:"ACTIVE"},{id:"b",status:"ACTIVE"},{id:"c",status:"ACTIVE"},{id:"left",status:"WITHDRAWN"}],
  sessions:[{id:"exam",examTypeId:"morning",identityKey:"2026-09-14:subject",examDate:"2026-09-14",category:"MORNING"}],
  participants:[{sessionId:"exam",studentId:"a",totalScore:80,isPartial:false},{sessionId:"exam",studentId:"left",totalScore:100,isPartial:false}],
  rules:[{id:"absence",points:-1,isActive:true},{id:"regular-absence",points:-3,isActive:true},{id:"first",points:3,isActive:true},{id:"second",points:2,isActive:true},{id:"third",points:1,isActive:true},{id:"monthly",points:3,isActive:true}],
  attendance:[],leave:[],
});
test("academy calendar gates morning absence and rank by start date, selected weekdays and closures",()=>{
  const data=source(), config=configuration();
  assert.equal(buildExamPointAwards(config,data,"2026-09","2026-09-14").length,3);
  assert.deepEqual(buildExamPointAwards({...config,morningStartDate:"2026-09-15"},data,"2026-09","2026-09-14"),[]);
  assert.deepEqual(buildExamPointAwards({...config,morningStartDate:null},data,"2026-09","2026-09-14"),[]);
  assert.deepEqual(buildExamPointAwards({...config,morningWeekdays:[3,5]},data,"2026-09","2026-09-14"),[]);
  assert.deepEqual(buildExamPointAwards({...config,morningExcludedDates:["2026-09-14"]},data,"2026-09","2026-09-14"),[]);
  assert.deepEqual(buildExamPointAwards(config,data,"2026-09","2026-09-13"),[]);
});
test("each academy controls amount and days; unconfigured academy remains disabled",()=>{
  const data=source();
  data.rules.find(rule=>rule.id==="absence")!.points=-7;
  assert.equal(buildExamPointAwards(configuration(),data,"2026-09","2026-09-14").find(row=>row.studentId==="b")!.points,-7);
  assert.deepEqual(buildExamPointAwards(examPointAutomationSchema.parse({}),data,"2026-09","2026-09-14"),[]);
  assert.equal(examPointAutomationSchema.safeParse({...configuration(),morningWeekdays:[0,6]}).success,false);
});
test("class, excused and approved leave exempt absence but do not count as participation",()=>{
  const data=source();
  for(const status of ["EXCUSED","HOLIDAY","HALF_HOLIDAY"]) {
    data.attendance=[{studentId:"b",date:"2026-09-14",status,reason:status==="EXCUSED"?"수업: 기본이론":null}];
    assert.equal(buildExamPointAwards(configuration(),data,"2026-09","2026-09-14").some(row=>row.studentId==="b"),false);
  }
  data.attendance=[];
  data.leave=[{studentId:"b",date:"2026-09-14",status:"APPROVED"}];
  assert.equal(buildExamPointAwards(configuration(),data,"2026-09","2026-09-14").some(row=>row.studentId==="b"),false);
  data.leave[0].status="REJECTED";
  assert.equal(buildExamPointAwards(configuration(),data,"2026-09","2026-09-14").find(row=>row.studentId==="b")?.points,-1);
});
test("rank uses active own participants, excludes partial scores and handles competition ties",()=>{
  const data=source(); data.sessions[0].category="REGULAR";
  data.participants.push({sessionId:"exam",studentId:"b",totalScore:80,isPartial:false},{sessionId:"exam",studentId:"c",totalScore:70,isPartial:false});
  let awards=buildExamPointAwards(configuration(),data,"2026-09","2026-09-14");
  assert.deepEqual(awards.map(row=>[row.studentId,row.points]),[["a",3],["b",3],["c",1]]);
  data.participants.find(row=>row.studentId==="a")!.isPartial=true;
  awards=buildExamPointAwards(configuration(),data,"2026-09","2026-09-14");
  assert.equal(awards.some(row=>row.studentId==="a"),false);
  assert.equal(awards.find(row=>row.studentId==="c")!.points,2);
});
test("multiple morning uploads charge absence once per day and respect course dates",()=>{
  const data=source(); data.sessions.push({...data.sessions[0],id:"exam2",examTypeId:"other"});
  data.students.find(row=>row.id==="c")!.courseStartDate="2026-09-15";
  data.students.push({id:"new",status:"ACTIVE",enrolledAt:"2026-09-15T00:00:00Z"});
  const awards=buildExamPointAwards(configuration(),data,"2026-09","2026-09-14");
  assert.equal(awards.filter(row=>row.points<0).length,1);
  assert.equal(awards.some(row=>row.studentId==="a" && row.points<0),false);
});
test("first month begins on academy start date; selected days alone determine monthly participation",()=>{
  const config={...configuration(),morningWeekdays:[1],morningExcludedDates:["2026-09-21"]};
  const data=source(); data.sessions.push({...data.sessions[0],id:"last",identityKey:"2026-09-28:subject",examDate:"2026-09-28"});
  data.participants.push({sessionId:"last",studentId:"a",totalScore:90,isPartial:false});
  const monthly=(today:string)=>buildExamPointAwards(config,data,"2026-09",today).filter(row=>row.ruleId==="monthly");
  assert.equal(monthly("2026-09-30").length,0);
  assert.deepEqual(monthly("2026-10-01").map(row=>row.studentId),["a"]);
  config.morningStartDate="2026-09-01";
  assert.equal(monthly("2026-10-01").length,0,"missing upload on earlier scheduled day blocks full participation");
  assert.ok(examPointDisplayNote(buildExamPointAwards(configuration(),source(),"2026-09","2026-09-14")[0].notes).startsWith("[자동] 아침"));
});
