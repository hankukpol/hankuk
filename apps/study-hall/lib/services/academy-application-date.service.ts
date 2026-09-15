import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { templatePreviewSchema, configurationRevision } from "@/lib/academy-template";
import { kstDate } from "@/lib/management-policy";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";

const inputSchema = z.object({ id: z.string().min(1), effectiveFrom: templatePreviewSchema.shape.effectiveFrom,
  reason: z.string().trim().min(1, "정정 사유를 입력해 주세요.").max(500), revision: z.string().optional() }).strict();
type Row = { id: string; status: string; effectiveFrom: string; templateName: string };
function preview(rows: Row[], input: z.infer<typeof inputSchema>) {
  const row = rows.find(r => r.id === input.id);
  if (!row) throw notFound("해당 학원의 적용 이력을 찾을 수 없습니다.");
  if (row.status !== "APPLIED") throw badRequest("적용 완료된 설정만 정정할 수 있습니다.");
  if (input.effectiveFrom > kstDate()) throw badRequest("적용 완료된 설정은 오늘 또는 과거 날짜로 정정해 주세요. 미래 변경은 적용 예약을 이용해 주세요.");
  if (input.effectiveFrom === row.effectiveFrom) throw badRequest("기존 적용일과 다른 날짜를 선택해 주세요.");
  return { id: row.id, name: row.templateName, before: row.effectiveFrom, after: input.effectiveFrom,
    reason: input.reason, revision: configurationRevision(rows),
    affectedFrom: [row.effectiveFrom, input.effectiveFrom].sort()[0],
    affectedUntil: new Date(Date.parse([row.effectiveFrom, input.effectiveFrom].sort()[1] + "T00:00:00Z") - 86400000).toISOString().slice(0,10) };
}
/** Date correction keeps the original snapshot order; later edits must retain precedence. */
export async function correctAcademyApplicationDate(slug: string, raw: unknown, actor: {id:string;name:string}, apply = false) {
  const input = inputSchema.parse(raw);
  const changesFor = (result: ReturnType<typeof preview>) => [
    {field: `application:${result.id}:effectiveFrom`, label: `${result.name} 적용일`, before:result.before, after:result.after},
    {field:"reason", label:"정정 사유", before:null, after:result.reason},
  ];
  let result: ReturnType<typeof preview>;
  if (isMockMode()) {
    const work = (state: Awaited<ReturnType<typeof readMockState>>) => {
      const division = state.divisions.find(d=>d.slug===slug);
      if (!division) throw notFound("학원을 찾을 수 없습니다.");
      const rows = state.academyApplications.filter(r=>r.divisionId===division.id);
      const value = preview(rows,input);
      if (apply) {
        if (input.revision !== value.revision) throw conflict("미리보기 이후 적용 이력이 변경되었습니다. 다시 확인해 주세요.");
        rows.find(r=>r.id===input.id)!.effectiveFrom=input.effectiveFrom;
        (state.divisionSettingsHistoryByDivision[slug] ??= []).push({id:randomUUID(),divisionId:division.id,
          section:"application-date",changes:changesFor(value),changedById:actor.id,changedByName:actor.name,changedAt:new Date().toISOString()});
      }
      return value;
    };
    result = apply ? await updateMockState(work) : work(await readMockState());
  } else {
    const prisma=await getPrismaClient();
    result=await prisma.$transaction(async tx=>{
      const division=await tx.division.findUnique({where:{slug},select:{id:true}});
      if (!division) throw notFound("학원을 찾을 수 없습니다.");
      const records=await tx.academyConfigurationApplication.findMany({where:{divisionId:division.id},orderBy:{id:"asc"}});
      const value=preview(records.map(r=>({...r,effectiveFrom:r.effectiveFrom.toISOString().slice(0,10)})),input);
      if(apply) {
        if(input.revision!==value.revision) throw conflict("미리보기 이후 적용 이력이 변경되었습니다. 다시 확인해 주세요.");
        await tx.academyConfigurationApplication.update({where:{id:input.id,divisionId:division.id},data:{effectiveFrom:new Date(input.effectiveFrom+"T00:00:00Z")}});
        await tx.divisionSettingsHistory.create({data:{divisionId:division.id,section:"application-date",changes:changesFor(value),changedById:actor.id,changedByName:actor.name}});
      }
      return value;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
  if(apply) revalidateDivisionOperationalViews(slug);
  return result;
}

export async function getAcademyApplicationDateCorrections(slug:string) {
  if(isMockMode()) return (await readMockState()).divisionSettingsHistoryByDivision[slug]?.filter(r=>r.section==="application-date") ?? [];
  const prisma=await getPrismaClient();
  return prisma.divisionSettingsHistory.findMany({where:{division:{slug},section:"application-date"},orderBy:{changedAt:"desc"}});
}
