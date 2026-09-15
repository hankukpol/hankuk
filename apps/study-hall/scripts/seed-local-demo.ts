/** Explicit local-only demo data. Never imported by the app or production seed. */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readMockState, updateMockState, type MockStudentRecord, type MockExamTypeRecord } from "../lib/mock-store";
import { kstDate } from "../lib/management-policy";
import { DEFAULT_ARRIVAL_CONFIG, effectiveArrivalConfig } from "../lib/arrivals";

type State = Awaited<ReturnType<typeof readMockState>>;
const PREFIX = "local-demo-v1-";
const now = new Date(), stamp = now.toISOString(), today = kstDate(now);
const dateAt = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const eventAt = (date: string, time = "08:40") => new Date(Math.min(new Date(`${date}T${time}:00+09:00`).getTime(), now.getTime())).toISOString();
const names = ["김민준", "이서연", "박지호", "최수빈", "정도윤", "강하린", "조현우", "윤지우", "장서준", "임채원", "한도현", "오유진", "서시우", "신예린", "권건우", "황다은", "안준서", "송지민", "류시윤", "홍서아", "전우진", "고수아", "문지훈", "양하은", "손민재", "배예원", "백준혁", "허유나", "유태윤", "남소율", "심도경", "노채린"];
function append<T extends { id: string }>(rows: T[], row: T) { if (!rows.some(r => r.id === row.id)) rows.push(row); }
function week(date: string) {
  const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return { weekYear: d.getUTCFullYear(), weekNumber: Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7) };
}
function inventory(state: State) {
  return Object.fromEntries(state.divisions.filter(d => d.isActive).map(d => [d.slug, Object.fromEntries(Object.entries(state).filter(([k,v]) => k.endsWith("ByDivision") && v && typeof v === "object").map(([k,v]) => [k, Array.isArray((v as Record<string, unknown>)[d.slug]) ? ((v as Record<string, unknown[]>)[d.slug]).length : undefined]).filter(([,v])=>v!==undefined))]));
}

function populate(state: State) {
  const logins: { division: string; number: string; name: string; admin: string; assistant: string | undefined }[] = [];
  for (const division of state.divisions.filter(d => d.isActive)) {
    const slug = division.slug, prefix = `${PREFIX}${slug}-`, settings = state.divisionSettingsByDivision[slug];
    const admin = state.admins.find(a => a.isActive && a.divisionSlug === slug && a.role === "ADMIN") ?? state.admins.find(a => a.isActive && a.role === "SUPER_ADMIN");
    if (!admin || !settings) throw Error(`학원 기본 정보 확인 필요: ${slug}`);
    const actor = admin.id;
    const count = slug === "police" ? 32 : 12;
    const periods = state.periodsByDivision[slug].filter(p => p.isActive);
    const students = state.studentsByDivision[slug];
    const roomId = prefix + "room";
    append(state.studyRoomsByDivision[slug], { id: roomId, divisionId: division.id, name: "테스트 자습실", columns: 8, rows: 4, aisleColumns: [], isActive: true, displayOrder: 90, createdAt: stamp, updatedAt: stamp });
    for (let i = 0; i < count; i++) append(state.seatsByDivision[slug], { id: prefix + `seat-${i}`, divisionId: division.id, studyRoomId: roomId, label: `T-${String(i + 1).padStart(2, "0")}`, positionX: i % 8 + 1, positionY: Math.floor(i / 8) + 1, isActive: true, createdAt: stamp, updatedAt: stamp });
    const tuition = state.tuitionPlansByDivision[slug].find(t => t.isActive);
    for (let i = 0; i < count; i++) {
      const id = prefix + `student-${i}`;
      if (students.some(s => s.id === id)) continue;
      let number = String(91001 + i);
      while (students.some(s => s.studentNumber === number)) number = String(Number(number) + 1000);
      const status: MockStudentRecord["status"] = i === count - 1 ? "GRADUATED" : i === count - 2 ? "WITHDRAWN" : i >= count - 4 ? "ON_LEAVE" : "ACTIVE";
      students.push({ id, divisionId: division.id, divisionSlug: slug, name: `테스트 ${names[i]}`, studentNumber: number, studyTrack: settings.studyTracks[i % Math.max(settings.studyTracks.length, 1)] ?? null,
        phone: "010-0000-0000", seatId: ["ACTIVE", "ON_LEAVE"].includes(status) ? prefix + `seat-${i}` : null, seatLabel: `T-${String(i + 1).padStart(2, "0")}`,
        courseStartDate: dateAt(-45), courseEndDate: status === "GRADUATED" ? dateAt(-2) : dateAt(i % 7 === 0 ? 4 : 45), tuitionPlanId: tuition?.id ?? null, tuitionAmount: tuition?.amount ?? 250000,
        tuitionExempt: i === count - 5, tuitionExemptReason: i === count - 5 ? "[목업] 장학생" : null, status, enrolledAt: eventAt(dateAt(-45)), withdrawnAt: status === "WITHDRAWN" ? eventAt(dateAt(-2)) : null,
        withdrawnNote: status === "WITHDRAWN" ? "[목업] 개인 일정으로 퇴원" : null, memo: "[목업] 자유롭게 수정·삭제 가능한 테스트 학생", createdAt: stamp, updatedAt: stamp });
    }
    const demo = students.filter(s => s.id.startsWith(prefix));
    const active = demo.filter(s => s.status === "ACTIVE" || s.status === "ON_LEAVE");
    logins.push({ division: slug, number: demo[0].studentNumber, name: demo[0].name, admin: admin.email, assistant: state.admins.find(a => a.isActive && a.divisionSlug === slug && a.role === "ASSISTANT")?.email });
    const bonusRule = state.pointRulesByDivision[slug].find(r => r.isActive && r.points > 0);
    const penaltyRule = state.pointRulesByDivision[slug].find(r => r.isActive && r.points < 0);
    const limits = [0, settings.warnLevel1, settings.warnLevel2, settings.warnInterview, settings.warnWithdraw];
    for (let i = 0; i < active.length; i++) {
      const student = active[i], key = prefix + `s${i}-`;
      append(state.pointRecordsByDivision[slug], { id: key + "merit", studentId: student.id, ruleId: bonusRule?.id ?? null, points: 5, date: today, notes: "[목업] 학습 목표 달성 상점", recordedById: actor, createdAt: stamp });
      if (i % 5) append(state.pointRecordsByDivision[slug], { id: key + "demerit", studentId: student.id, ruleId: penaltyRule?.id ?? null, points: -(limits[i % 5] + 5), date: today, notes: "[목업] 경고 단계별 확인용 누적 벌점", recordedById: actor, createdAt: stamp });
      for (let offset = -34; offset <= 0; offset++) {
        const date = dateAt(offset), weekday = new Date(date + "T00:00:00Z").getUTCDay();
        if (weekday === 0) continue;
        for (let p = 0; p < periods.length; p++) {
          if (offset < -6 && (i >= 2 || p >= 2)) continue;
          const period = periods[p];
          if (state.attendanceByDivision[slug].some(r => r.studentId === student.id && r.periodId === period.id && r.date === date)) continue;
          const choice = (i + Math.abs(offset) * 3) % 14;
          if (offset === 0 && i % 11 === 10) continue;
          const status = choice === 3 ? "EXCUSED" : choice === 5 ? "ABSENT" : choice === 7 ? "TARDY" : choice === 9 ? "EXCUSED" : "PRESENT";
          const reason = choice === 3 ? "수업: [목업] 기본 이론" : choice === 9 ? "[목업] 병원 진료" : choice === 5 ? "[목업] 무단결석 확인" : null;
          append(state.attendanceByDivision[slug], { id: key + `attendance-${date}-${period.id}`, studentId: student.id, periodId: period.id, date, status, reason,
            checkInTime: status === "PRESENT" || status === "TARDY" ? eventAt(date, period.startTime) : null, recordedById: actor, createdAt: stamp, updatedAt: stamp });
          if (offset === 0) append(state.phoneSubmissionsByDivision[slug], { id: key + `phone-${date}-${period.id}`, divisionId: division.id, studentId: student.id, periodId: period.id, date,
            status: i % 7 === 0 ? "NOT_SUBMITTED" : i % 7 === 1 ? "RENTED" : "SUBMITTED", rentalNote: i % 7 === 1 ? "[목업] 보호자 통화, 10분 후 반납" : null, recordedById: actor, createdAt: stamp, updatedAt: stamp });
        }
        if (i % 10 === 9 || (i >= 6 && offset < -6)) continue;
        state.arrivalsByDivision[slug] ??= []; state.arrivalHistoryByDivision[slug] ??= [];
        if (!state.arrivalsByDivision[slug].some(r => r.studentId === student.id && r.date === date)) {
          const at = eventAt(date, `${i % 6 === 0 ? "09" : "08"}:${String(10 + i % 45).padStart(2, "0")}`);
          const arrival = { id: key + `arrival-${date}`, divisionId: division.id, studentId: student.id, date, firstReceivedAt: null, effectiveAt: at, source: "ADMIN_ADDED" as const, deviceId: null, deviceName: null, cancelledAt: null, version: 1, createdAt: stamp, updatedAt: stamp };
          state.arrivalsByDivision[slug].push(arrival);
          state.arrivalHistoryByDivision[slug].push({ id: arrival.id + "-history", divisionId: division.id, arrivalId: arrival.id, studentId: student.id, action: "ADD", before: null, after: arrival, reason: "[목업] 등원 달력 테스트", actorId: actor, actorName: admin.name, createdAt: stamp });
        }
      }
      const paymentCategory = state.paymentCategoriesByDivision[slug].find(p => p.isActive && p.name.includes("월")) ?? state.paymentCategoriesByDivision[slug].find(p => p.isActive);
      if (paymentCategory && i % 4 !== 3) {
        const amount = student.tuitionAmount ?? 250000;
        const payment = { id: key + "payment", studentId: student.id, paymentTypeId: paymentCategory.id, amount: i % 4 === 1 ? Math.round(amount / 2) : amount, paymentDate: today, method: ["카드", "계좌이체", "현금"][i % 3], paymentGroupId: key + "group", originalPaymentId: null, notes: "[목업] 완납·부분납·환불 테스트", recordedById: actor, createdAt: stamp };
        append(state.paymentRecordsByDivision[slug], payment);
        if (i % 4 === 2) append(state.paymentRecordsByDivision[slug], { ...payment, id: key + "refund", amount: -Math.round(amount / 3), originalPaymentId: payment.id, notes: "[목업] 일부 환불" });
      }
      if (i < 8) append(state.leavePermissionsByDivision[slug], { id: key + "leave", studentId: student.id, type: (["OUTING", "HEALTH", "HOLIDAY", "HALF_DAY"] as const)[i % 4], date: dateAt(i < 4 ? 1 : -2), reason: "[목업] 병원·개인 일정 확인", approvedById: actor, status: (["PENDING", "APPROVED", "REJECTED", "USED"] as const)[i % 4], createdAt: stamp });
      if (i < 8) append(state.interviewsByDivision[slug], { id: key + "interview", studentId: student.id, date: dateAt(-i), trigger: "[목업] 생활·학습 점검", reason: "취약 과목과 출결 개선 계획 확인", content: "최근 성적 추이와 오답 유형을 함께 검토했습니다. 취약 단원 복습과 일일 학습 목표를 정했습니다.", result: "주 3회 오답 복습 후 재확인", resultType: (["WARNING_1", "WARNING_2", "INTERVIEW", "WITHDRAWAL"] as const)[i % 4], followUpDate: i % 3 ? dateAt(i % 2 ? 0 : 2) : null, status: i % 3 ? "OPEN" : "CLOSED", guardianContacted: i % 2 === 0, closedAt: i % 3 ? null : stamp, closedById: i % 3 ? null : actor, createdById: actor, createdAt: stamp });
      if (i > 0 && i < 5) append(state.warningNoticesByDivision[slug], { id: key + "notice", divisionId: division.id, studentId: student.id, stage: (["WARNING_1", "WARNING_2", "INTERVIEW", "WITHDRAWAL"] as const)[i - 1], demeritPoints: limits[i] + 5, thresholdSnapshot: { warnLevel1: settings.warnLevel1, warnLevel2: settings.warnLevel2, warnInterview: settings.warnInterview, warnWithdraw: settings.warnWithdraw }, aggregationMode: "MONTHLY", channel: "IN_PERSON", noticeBody: "[목업] 경고 안내 완료 예시. 실제 발송하지 않았습니다.", memo: "[목업] 테스트 이력", noticedAt: stamp, noticedById: actor, noticedByName: admin.name, createdAt: stamp });
    }
    for (let n = 0; n < 3; n++) append(state.announcementsByDivision[slug], { id: prefix + `announcement-${n}`, divisionId: division.id, title: `[테스트] ${["이번 주 학습 및 생활 안내", "모의고사 일정 안내", "자습실 이용 안내"][n]}`, content: "직접 수정·삭제해 볼 수 있는 목업 공지입니다. 테스트 학생의 출결, 성적, 상벌점과 개인 달력을 확인해 주세요.", isPinned: n === 0, publishedAt: stamp, createdById: actor, createdAt: stamp, updatedAt: stamp });
    append(state.chatMessagesByDivision[slug], { id: prefix + "chat", divisionId: division.id, authorId: actor, authorName: admin.name, body: "[목업] 업무 메모 테스트입니다. 테스트 학생의 출결·성적·상벌점을 확인해 보세요. 실제 운영 메시지가 아닙니다.", createdAt: stamp, updatedAt: stamp, deletedAt: null, deletedById: null });
    for (let n = 0; n < 3; n++) append(state.examSchedulesByDivision[slug], { id: prefix + `schedule-${n}`, divisionId: division.id, name: `[테스트] ${["정기 모의고사", "체력 측정", "면접 연습"][n]}`, type: (["WRITTEN", "PHYSICAL", "INTERVIEW"] as const)[n], examDate: dateAt(3 + n * 7), description: "목업 일정 — 실제 시험 일정이 아닙니다.", isActive: true, createdById: actor, createdAt: stamp, updatedAt: stamp });
    const examTypes = state.examTypesByDivision[slug];
    if (!examTypes.some(e => e.isActive && e.category === "MORNING")) {
      const model = examTypes.find(e => e.isActive);
      if (model) {
        const id = prefix + "morning-type";
        append(examTypes, { ...model, id, name: "[테스트] 아침 모의고사", category: "MORNING", displayOrder: 99, subjects: model.subjects.map((s,i) => ({ ...s, id: id + `-subject-${i}`, examTypeId: id })), createdAt: stamp, updatedAt: stamp });
      }
    }
    for (const type of examTypes.filter(e => e.isActive)) seedExam(state, slug, division.id, actor, prefix, type, active);
    // Enable only the standalone local check-in demo; never enable penalty automation.
    const document = settings.arrivalSettings ?? { revision: 0, versions: [] };
    if (!effectiveArrivalConfig(document, today).enabled && !document.versions.length) settings.arrivalSettings = { revision: 1, versions: [{ ...DEFAULT_ARRIVAL_CONFIG, enabled: true, effectiveDate: today, id: prefix + "arrival-config", savedAt: stamp, savedById: actor, savedByName: "목업 데이터 설정" }] };
  }
  return logins;
}

function seedExam(state: State, slug: string, divisionId: string, actor: string, prefix: string, type: MockExamTypeRecord, active: MockStudentRecord[]) {
  const students = active.filter(s => !type.studyTrack || s.studyTrack === type.studyTrack);
  const subjects = type.subjects.filter(s => s.isActive);
  if (!students.length || !subjects.length) return;
  if (type.category === "MORNING") {
    for (let offset = -20; offset <= 0; offset++) {
      const date = dateAt(offset), weekday = new Date(date + "T00:00:00Z").getUTCDay(); if (weekday === 0 || weekday === 6) continue;
      const subject = subjects[(weekday - 1) % subjects.length], max = (subject.totalItems ?? 20) * (subject.pointsPerItem ?? 5);
      students.forEach((s,i) => {
        if (state.morningExamScoresByDivision[slug].some(r => r.studentId === s.id && r.examTypeId === type.id && r.subjectId === subject.id && r.examDate === date)) return;
        append(state.morningExamScoresByDivision[slug], { id: prefix + `morning-${type.id}-${date}-${i}`, studentId: s.id, examTypeId: type.id, subjectId: subject.id, examDate: date, score: i % 13 === 12 ? null : Math.round(max * (50 + (i * 7 + offset + 30) % 45) / 100), ...week(date), notes: "[목업] 아침 시험 추이", recordedById: actor, createdAt: stamp, updatedAt: stamp });
      });
    }
    return;
  }
  for (let round = 0; round < 5; round++) {
    const date = dateAt(-28 + round * 7), sessionId = prefix + `session-${type.id}-${date}`;
    if (state.examSessionsByDivision[slug]?.some(s => s.id === sessionId)) continue;
    const fullScore = subjects.reduce((sum,s) => sum + (s.totalItems ?? 20) * (s.pointsPerItem ?? 5),0);
    const cohort = Array.from({length:120},(_,i)=> {
      const responses: {subjectId:string;itemNo:number;answer:string;isCorrect:boolean}[] = [];
      const scores: Record<string,number> = {};
      subjects.forEach((subject,si) => {
        let correct = 0;
        for(let q=1;q<=(subject.totalItems??20);q++) {
          const isCorrect=(i*17+q*13+si*11+round*7)%100 < Math.min(92,42+(i%9)*5+round*4-(si===1?12:0));
          const key=String(q%4+1); if(isCorrect)correct++;
          responses.push({subjectId:subject.id,itemNo:q,answer:isCorrect?key:String((q+1)%4+1),isCorrect});
        }
        scores[subject.id]=correct*(subject.pointsPerItem??5);
      });
      return {scores,total:Object.values(scores).reduce((a,b)=>a+b,0),responses};
    });
    const distribution = (values:number[]) => Array.from(new Set(values)).sort((a,b)=>a-b).map(score=>({score,count:values.filter(v=>v===score).length}));
    const mean = (values:number[]) => values.reduce((a,b)=>a+b,0)/values.length;
    const order=cohort.map((c,i)=>({i,total:c.total})).sort((a,b)=>b.total-a.total);
    state.examSessionsByDivision[slug]??=[]; state.examSessionItemsByDivision[slug]??=[]; state.examSessionParticipantsByDivision[slug]??=[]; state.examItemResponsesByDivision[slug]??=[];
    append(state.examSessionsByDivision[slug], {id:sessionId,divisionId,examTypeId:type.id,identityKey:sessionId,primarySubjectId:null,examDate:date,topic:"[목업] 성적·취약 문항 분석",itemCount:cohort[0].responses.length,fullScore,externalCohortSize:120,
      externalStats:{count:120,mean:mean(cohort.map(c=>c.total)),distribution:distribution(cohort.map(c=>c.total)),regions:{},subjects:Object.fromEntries(subjects.map(s=>[s.id,{count:120,mean:mean(cohort.map(c=>c.scores[s.id])),distribution:distribution(cohort.map(c=>c.scores[s.id])),top10Avg:mean(order.slice(0,12).map(o=>cohort[o.i].scores[s.id])),top30Avg:mean(order.slice(0,36).map(o=>cohort[o.i].scores[s.id])),top10Count:12,top30Count:36,top10Complete:true,top30Complete:true}]))},sourceFileName:"local-demo-generated.xlsx",importedById:actor,importedAt:stamp});
    cohort[0].responses.forEach((r,pos)=> {
      const values=cohort.map(c=>c.responses[pos]),rates=Object.fromEntries(["1","2","3","4"].map(choice=>[choice,values.filter(v=>v.answer===choice).length/120*100]));
      const subject=subjects.find(s=>s.id===r.subjectId)!;
      append(state.examSessionItemsByDivision[slug], {id:sessionId+`-q${pos}`,divisionId,sessionId,subjectId:r.subjectId,itemNo:r.itemNo,position:pos+1,answerKey:String(r.itemNo%4+1),points:subject.pointsPerItem??5,correctRatePct:values.filter(v=>v.isCorrect).length/120*100,choiceRates:rates,mostCommonWrong:String((r.itemNo+1)%4+1)});
    });
    const nextRound=Math.max(0,...state.examScoresByDivision[slug].filter(s=>s.examTypeId===type.id).map(s=>s.examRound))+1;
    students.forEach((student,i)=> {
      if(state.examScoresByDivision[slug].some(r=>r.studentId===student.id&&r.examTypeId===type.id&&r.examDate===date))return;
      const result=cohort[i],id=sessionId+`-score-${i}`,rank=cohort.filter(c=>c.total>result.total).length+1;
      append(state.examScoresByDivision[slug], {id,studentId:student.id,examTypeId:type.id,examRound:nextRound,examDate:date,scores:result.scores,totalScore:result.total,rankInClass:cohort.slice(0,students.length).filter(c=>c.total>result.total).length+1,notes:"[목업] 회차별 성적·오답 분석",recordedById:actor,createdAt:stamp,updatedAt:stamp});
      append(state.examSessionParticipantsByDivision[slug], {id:sessionId+`-participant-${i}`,divisionId,sessionId,studentId:student.id,region:null,subjectScores:result.scores,totalScore:result.total,isPartial:false,externalRank:rank,externalPercentile:(120-rank+1)/120*100,regionalRank:null});
      if (round >= 3 && i < 2) result.responses.forEach((r,ri)=>append(state.examItemResponsesByDivision[slug],{...r,id:sessionId+`-r-${i}-${ri}`,divisionId,sessionId,studentId:student.id}));
      append(state.scoreTargetsByDivision[slug],{id:prefix+`target-${type.id}-${i}`,studentId:student.id,examTypeId:type.id,targetScore:Math.round(fullScore*.8),note:"[목업] 목표 점수",createdAt:stamp,updatedAt:stamp});
    });
  }
}

async function main() {
  if (process.env.MOCK_MODE !== "true" || process.env.NODE_ENV === "production") throw Error("MOCK_MODE=true 로컬 개발 환경에서만 실행할 수 있습니다.");
  const folder=path.resolve(process.env.MOCK_DB_DIR??".local");
  const before=await readMockState(), beforeCounts=inventory(before);
  const preview=structuredClone(before);const logins=populate(preview);
  const once=JSON.stringify(preview); populate(preview);
  assert.equal(JSON.stringify(preview),once,"반복 실행 시 기존 데모를 변경하거나 중복 생성할 수 없습니다.");
  if(!process.argv.includes("--apply")){console.log(JSON.stringify({mode:"preview",before:beforeCounts,after:inventory(preview),logins},null,2));return;}
  const backupFolder=path.join(folder,"demo-backups",stamp.replace(/[:.]/g,"-"));await mkdir(backupFolder,{recursive:true});
  const original=await readFile(path.join(folder,"mock-db.json"),"utf8");await writeFile(path.join(backupFolder,"mock-db.json"),original,"utf8");
  await updateMockState(state=>{
    // The callback reads fresh state and only appends new IDs; existing records stay intact.
    populate(state);
  });
  const after=await readMockState();
  for (const [key, value] of Object.entries(before)) {
    if (!key.endsWith("ByDivision") || !value || typeof value !== "object") continue;
    for (const [slug, rows] of Object.entries(value)) {
      if (!Array.isArray(rows)) continue;
      const nextRows=(after as unknown as Record<string,Record<string,{id:string}[]>>)[key][slug];
      const nextById=new Map(nextRows.map(row=>[row.id,row]));
      for(const row of rows) assert.deepEqual(nextById.get(row.id),row,`기존 기록 보존: ${key}/${slug}/${row.id}`);
    }
  }
  const report={mode:"applied",date:today,backupFolder,backupSha256:createHash("sha256").update(original).digest("hex"),before:beforeCounts,after:inventory(after),logins};
  await writeFile(path.join(folder,"demo-data-report.json"),JSON.stringify(report,null,2),"utf8");
  console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
