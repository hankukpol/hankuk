import assert from "node:assert/strict";
import test from "node:test";
import { buildExamPointAwards, examPointAutomationSchema, examPointDisplayNote, type ExamPointSource } from "../../lib/exam-point-automation";

const configuration = () => examPointAutomationSchema.parse({enabled:true,effectiveFrom:"2026-09-01",morningStartDate:"2026-09-14",morningWeekdays:[1,3,5],morningAbsenceRuleId:"absence",regularAbsenceRuleId:"regular-absence",morningFirstRuleId:"first",regularFirstRuleId:"first",regularSecondRuleId:"second",regularThirdRuleId:"third",morningMonthlyRuleId:"monthly"});
const source = (): ExamPointSource => ({
  students:[{id:"a",status:"ACTIVE"},{id:"b",status:"ACTIVE"},{id:"c",status:"ACTIVE"},{id:"left",status:"WITHDRAWN"}],
  sessions:[{id:"exam",examTypeId:"morning",identityKey:"2026-09-14:subject",examDate:"2026-09-14",category:"MORNING",fullScore:100}],
  participants:[{sessionId:"exam",studentId:"a",totalScore:80,isPartial:false},{sessionId:"exam",studentId:"left",totalScore:100,isPartial:false}],
  rules:[{id:"absence",points:-1,isActive:true},{id:"regular-absence",points:-3,isActive:true},{id:"first",points:3,isActive:true},{id:"second",points:2,isActive:true},{id:"third",points:1,isActive:true},{id:"monthly",points:3,isActive:true}],
  attendance:[],leave:[],
});
test("academy calendar gates morning absence and rank by start date, selected weekdays and closures",()=>{
  const data=source(), config=configuration();
  assert.equal(buildExamPointAwards(config,data,"2026-09","2026-09-14").length,2);
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
  let awards=buildExamPointAwards(configuration(),data,"2026-09","2026-10-01");
  assert.deepEqual(awards.map(row=>[row.studentId,row.points]),[["a",3],["b",3],["c",1]]);
  data.participants.find(row=>row.studentId==="a")!.isPartial=true;
  awards=buildExamPointAwards(configuration(),data,"2026-09","2026-10-01");
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

test("first exam and month-end never grant rank merits; next month grants only one monthly winner",()=>{
  const data=source();
  data.sessions.push({...data.sessions[0],id:"exam2",identityKey:"2026-09-16",examDate:"2026-09-16"});
  data.participants.push({sessionId:"exam",studentId:"b",totalScore:90,isPartial:false},{sessionId:"exam2",studentId:"a",totalScore:100,isPartial:false},{sessionId:"exam2",studentId:"b",totalScore:50,isPartial:false});
  const ranks=(today:string)=>buildExamPointAwards(configuration(),data,"2026-09",today).filter(r=>r.notes.includes("[rank-month:"));
  assert.deepEqual(ranks("2026-09-14"),[]);
  assert.deepEqual(ranks("2026-09-30"),[]);
  assert.deepEqual(ranks("2026-10-01").map(r=>[r.studentId,r.points,r.date]),[["a",3,"2026-09-30"]]);
  assert.ok(ranks("2026-10-01")[0].notes.includes("2026-09 아침모의고사 월간 1등"));
});

test("each academy can choose monthly average or total; scores use the session full score",()=>{
  const data=source();
  data.participants=[{sessionId:"exam",studentId:"a",totalScore:90,isPartial:false},{sessionId:"exam",studentId:"b",totalScore:80,isPartial:false}];
  data.sessions.push({...data.sessions[0],id:"exam2",examTypeId:"other",fullScore:50,identityKey:"2026-09-16",examDate:"2026-09-16"});
  data.participants.push({sessionId:"exam2",studentId:"b",totalScore:40,isPartial:false});
  const ranks=(rankAggregation:"AVERAGE"|"TOTAL")=>buildExamPointAwards({...configuration(),rankAggregation},data,"2026-09","2026-10-01").filter(r=>r.notes.includes("[rank-month:"));
  assert.deepEqual(ranks("AVERAGE").map(r=>r.studentId),["a"]);
  assert.deepEqual(ranks("TOTAL").map(r=>r.studentId),["b"]);
  data.sessions[1].fullScore=0;
  assert.deepEqual(ranks("TOTAL").map(r=>r.studentId),["a"],"invalid full score cannot enter rankings");
});

test("morning and regular monthly merits are separate and never multiply across exam types",()=>{
  const data=source();
  data.sessions.push({...data.sessions[0],id:"other",examTypeId:"other"},{...data.sessions[0],id:"regular",examTypeId:"regular",category:"REGULAR"});
  data.participants.push({sessionId:"other",studentId:"a",totalScore:100,isPartial:false},{sessionId:"regular",studentId:"a",totalScore:70,isPartial:false});
  const ranks=buildExamPointAwards(configuration(),data,"2026-09","2026-10-01").filter(r=>r.notes.includes("[rank-month:"));
  assert.equal(ranks.length,2);
  assert.equal(new Set(ranks.map(r=>r.notes)).size,2);
  assert.equal(ranks.filter(r=>r.notes.includes("[rank-month:MORNING:")).length,1);
});

test("monthly rankings preserve academy start/calendar filters and separate study tracks",()=>{
  const data=source(),config=configuration();
  data.students[0].studyTrack="공채";data.students[1].studyTrack="경채";
  data.participants.push({sessionId:"exam",studentId:"b",totalScore:90,isPartial:false});
  const ranks=(settings= config)=>buildExamPointAwards(settings,data,"2026-09","2026-10-01").filter(r=>r.notes.includes("[rank-month:"));
  assert.deepEqual(ranks().map(r=>r.studentId),["a","b"]);
  assert.deepEqual(ranks({...config,morningExcludedDates:["2026-09-14"]}),[]);
  assert.deepEqual(ranks({...config,morningStartDate:"2026-09-15"}),[]);
  data.students[0].courseStartDate="2026-09-15";
  assert.deepEqual(ranks().map(r=>r.studentId),["b"]);
});

test("configured monthly ties use attempt count then the same study minutes as study ranking",()=>{
  const data=source(); data.sessions[0].category="REGULAR";
  data.sessions.push({...data.sessions[0],id:"second",examDate:"2026-09-16",identityKey:"2026-09-16"});
  data.participants=[{sessionId:"exam",studentId:"a",totalScore:90,isPartial:false},{sessionId:"exam",studentId:"b",totalScore:50,isPartial:false},{sessionId:"second",studentId:"b",totalScore:40,isPartial:false},{sessionId:"exam",studentId:"c",totalScore:45,isPartial:false},{sessionId:"second",studentId:"c",totalScore:45,isPartial:false}];
  data.periods=[{id:"period",endTime:"10:00"}];
  data.attendance=[{studentId:"b",date:"2026-09-14",status:"TARDY",reason:null,periodId:"period",checkInTime:"2026-09-14T00:30:00Z"},{studentId:"c",date:"2026-09-14",status:"PRESENT",reason:null,periodId:"period",checkInTime:"2026-09-14T00:00:00Z"},{studentId:"b",date:"2026-09-15",status:"EXCUSED",reason:"수업",periodId:"period",checkInTime:"2026-09-15T00:00:00Z"}];
  const config={...configuration(),rankAggregation:"TOTAL" as const,rankTieBreak:"ATTEMPTS_STUDY_TIME" as const};
  const ranks=buildExamPointAwards(config,data,"2026-09","2026-10-01").filter(r=>r.notes.includes("[rank-month:"));
  assert.deepEqual(ranks.map(r=>[r.studentId,r.points]),[["a",1],["b",2],["c",3]]);
  const shared=buildExamPointAwards({...config,rankTieBreak:"SHARED"},data,"2026-09","2026-10-01").filter(r=>r.notes.includes("[rank-month:"));
  assert.deepEqual(shared.map(r=>r.points),[3,3,3]);
});
