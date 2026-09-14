import type { Prisma } from "@prisma/client";
import { EXAM_POINT_RULE_FIELDS, examPointAutomationSchema, parseExamPointAutomation, type ExamPointRuleField, type ExamPointAutomation } from "@/lib/exam-point-automation";
import { badRequest, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getDivisionBySlugOrThrow, getPrismaClient } from "@/lib/service-helpers";
import { recordDivisionSettingsChange } from "@/lib/services/settings-history.service";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { kstDate } from "@/lib/management-policy";
import { syncDbExamPoints, syncMockExamPoints } from "@/lib/services/exam-point.service";

export async function getExamPointSettings(slug: string) {
  if(isMockMode()) {
    const state=await readMockState();
    if(!state.divisions.some(d=>d.slug===slug)) throw notFound("학원을 찾을 수 없습니다.");
    return {config:parseExamPointAutomation(state.divisionSettingsByDivision[slug]?.examPointAutomation), rules:(state.pointRulesByDivision[slug]??[]).map(r=>({id:r.id,name:r.name,points:r.points,isActive:r.isActive}))};
  }
  const division=await getDivisionBySlugOrThrow(slug); const prisma=await getPrismaClient();
  const [settings,rules]=await Promise.all([
    prisma.divisionSettings.findUnique({where:{divisionId:division.id},select:{examPointAutomation:true}}),
    prisma.pointRule.findMany({where:{divisionId:division.id},select:{id:true,name:true,points:true,isActive:true},orderBy:{displayOrder:"asc"}}),
  ]);
  return {config:parseExamPointAutomation(settings?.examPointAutomation),rules};
}
function validateRules(config: ExamPointAutomation, rules:{id:string;points:number;isActive:boolean}[]) {
  for(const field of Object.keys(EXAM_POINT_RULE_FIELDS) as ExamPointRuleField[]) {
    const id=config[field]; if(!id)continue;
    const rule=rules.find(r=>r.id===id);
    if(!rule) throw badRequest("현재 학원의 상벌점 규칙만 선택할 수 있습니다.");
    if(field.includes("Absence") ? rule.points>=0 : rule.points<=0) throw badRequest(`${EXAM_POINT_RULE_FIELDS[field]}의 상점·벌점 방향을 확인해 주세요.`);
    if(config.enabled && !rule.isActive) throw badRequest("비활성 규칙은 자동 부여에 연결할 수 없습니다.");
  }
}
export async function updateExamPointSettings(slug:string, value:unknown, actor:{id:string;name:string}) {
  const config=examPointAutomationSchema.parse(value);
  const before=await getExamPointSettings(slug);
  const currentMonth=kstDate().slice(0,7);
  const prior=new Date(`${currentMonth}-01T00:00:00Z`); prior.setUTCDate(0);
  const months=[currentMonth,prior.toISOString().slice(0,7)];
  if(isMockMode()) await updateMockState(state=>{
    validateRules(config,state.pointRulesByDivision[slug]??[]);
    state.divisionSettingsByDivision[slug].examPointAutomation=config;
    for(const month of months) syncMockExamPoints(state,slug,month,actor.id);
  });
  else {
    const division=await getDivisionBySlugOrThrow(slug);const prisma=await getPrismaClient();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`exam-points:${division.id}`}))`;
      validateRules(config,await tx.pointRule.findMany({where:{divisionId:division.id}}));
      await tx.divisionSettings.upsert({where:{divisionId:division.id},create:{divisionId:division.id,examPointAutomation:config as Prisma.InputJsonValue},update:{examPointAutomation:config as Prisma.InputJsonValue}});
      for(const month of months) await syncDbExamPoints(tx,division.id,month,actor.id);
    },{timeout:30000});
  }
  const labels:Record<string,string>={...EXAM_POINT_RULE_FIELDS,enabled:"성적 자동 상벌점 사용",effectiveFrom:"자동 부여 시작일",morningStartDate:"아침모의고사 시작일",morningWeekdays:"아침모의고사 요일",morningExcludedDates:"아침모의고사 제외일",rankAggregation:"월간 성적 순위 기준",rankTieBreak:"월간 성적 동점 기준",settleUnusedLeaveAutomatically:"휴일권 미사용 자동 월 마감"};
  const describe=(field:string,value:unknown)=>field==="rankTieBreak"?(value==="ATTEMPTS_STUDY_TIME"?"응시 횟수, 순공시간 순":"공동 순위"):field==="rankAggregation"?(value==="TOTAL"?"월 누적 점수":"응시한 시험의 월평균 점수"):field.endsWith("RuleId")?before.rules.find(r=>r.id===value)?.name??null:field==="morningWeekdays" && Array.isArray(value)?value.map(day=>["일","월","화","수","목","금","토"][day]).join(", "):value;
  const changes=Object.entries(labels).filter(([field])=>JSON.stringify(before.config[field as keyof ExamPointAutomation])!==JSON.stringify(config[field as keyof ExamPointAutomation])).map(([field,label])=>({field:`examPointAutomation.${field}`,label,before:describe(field,before.config[field as keyof ExamPointAutomation]),after:describe(field,config[field as keyof ExamPointAutomation])}));
  await recordDivisionSettingsChange(slug,actor,changes);
  revalidateDivisionOperationalViews(slug);
  return config;
}
