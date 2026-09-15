import { createHash } from "node:crypto";
import { z } from "zod";
import { badRequest, conflict, notFound } from "./errors";
import { derivedScoreSnapshot, planExamImportDeletion, type DerivedScore } from "./exam-import-history";
import type { MockExamSessionRecord, MockExamSessionParticipantRecord, MockExamSessionItemRecord, MockExamItemResponseRecord } from "./mock-store";

export const examCorrectionSchema = z.object({
  revision: z.string().length(64), studentId: z.string().min(1).max(128),
  targetStudentId: z.string().min(1).max(128), reason: z.string().trim().min(2).max(1000),
  responses: z.array(z.object({ subjectId: z.string().min(1).max(128), itemNo: z.number().int().positive(), answer: z.string().trim().max(20).nullable(), isCorrect: z.boolean() }).strict()).max(500),
}).strict();
export type CorrectionInput = z.infer<typeof examCorrectionSchema>;
export type CorrectionAudit = { id: string; divisionId: string; sessionId: string; examTypeId: string; examDate: string; actorId: string; actorName: string; reason: string; createdAt: string; before: CorrectionSnapshot; after: CorrectionSnapshot };
export type CorrectionSnapshot = { studentId: string; studentName: string; studentNumber: string; totalScore: number; subjectScores: Record<string, number>; responses: CorrectionInput["responses"] };
export type CorrectionBundle = {
  session: MockExamSessionRecord;
  participants: MockExamSessionParticipantRecord[];
  items: MockExamSessionItemRecord[];
  responses: MockExamItemResponseRecord[];
  scores: DerivedScore[];
  students: { id: string; name: string; studentNumber: string }[];
  subjects: { id: string; name: string }[];
};
export function correctionRevision(bundle: CorrectionBundle) {
  return createHash("sha256").update(JSON.stringify([bundle.session, [...bundle.items].sort((a,b)=>a.id.localeCompare(b.id)), [...bundle.participants].sort((a,b)=>a.id.localeCompare(b.id)), [...bundle.responses].sort((a,b)=>a.id.localeCompare(b.id)), [...bundle.scores].sort((a,b)=>a.id.localeCompare(b.id))])).digest("hex");
}
export function prepareExamCorrection(bundle: CorrectionBundle, input: CorrectionInput, actorId: string, now: string) {
  if (correctionRevision(bundle) !== input.revision) throw conflict("다른 작업으로 성적이 변경되었습니다. 닫고 다시 조회해 주세요.");
  const participant = bundle.participants.find(p=>p.studentId===input.studentId);
  const target = bundle.students.find(s=>s.id===input.targetStudentId);
  const source = bundle.students.find(s=>s.id===input.studentId);
  if (!participant || !target || !source) throw notFound("이 학원의 학생 성적을 찾을 수 없습니다.");
  if (input.targetStudentId !== input.studentId && (bundle.participants.some(p=>p.studentId===input.targetStudentId) || bundle.scores.some(s=>s.studentId===input.targetStudentId))) throw conflict("대상 학생에게 이미 이 시험 성적이 있습니다. 덮어쓸 수 없습니다.");
  const proof = planExamImportDeletion(bundle.session,bundle.participants,bundle.scores);
  if (proof.keptManualScores || proof.deletable.length !== bundle.participants.length) throw conflict("수기 성적 변경 또는 원본 연결을 확인할 수 없어 정정을 중단했습니다.");
  const original = bundle.responses.filter(r=>r.studentId===input.studentId);
  const keys = new Set(original.map(r=>`${r.subjectId}:${r.itemNo}`));
  const changedKeys = new Set(input.responses.map(r=>`${r.subjectId}:${r.itemNo}`));
  if (keys.size !== input.responses.length || changedKeys.size !== keys.size || Array.from(changedKeys).some(k=>!keys.has(k))) throw badRequest("기존 응시 과목의 문항 전체를 확인해 주세요.");
  const subjectScores = Object.fromEntries(Object.keys(participant.subjectScores).map(id=>[id,0]));
  const nextResponses = original.map(row=>{
    const change=input.responses.find(r=>r.subjectId===row.subjectId && r.itemNo===row.itemNo)!;
    const item=bundle.items.find(i=>i.subjectId===row.subjectId && i.itemNo===row.itemNo);
    if (!item || !Number.isFinite(item.points) || item.points < 0) throw badRequest("문항 배점 정보가 없습니다.");
    if (!(row.subjectId in subjectScores)) throw badRequest("응시 과목 정보가 일치하지 않습니다.");
    subjectScores[row.subjectId]+=change.isCorrect ? item.points : 0;
    return {...row,...change,answer:change.answer?.trim() || null,studentId:target.id};
  });
  for (const id of Object.keys(subjectScores)) subjectScores[id]=Math.round(subjectScores[id]*1e6)/1e6;
  const totalScore=Math.round(Object.values(subjectScores).reduce((a,b)=>a+b,0)*1e6)/1e6;
  if (bundle.session.primarySubjectId && !Number.isInteger(totalScore)) throw badRequest("아침 모의고사 점수는 정수여야 합니다.");
  const snapshot=(student:typeof source,scores:Record<string,number>,total:number,rows:typeof original):CorrectionSnapshot=>({studentId:student.id,studentName:student.name,studentNumber:student.studentNumber,subjectScores:scores,totalScore:total,responses:rows.map(({subjectId,itemNo,answer,isCorrect})=>({subjectId,itemNo,answer,isCorrect}))});
  const before=snapshot(source,participant.subjectScores,participant.totalScore,original);
  const after=snapshot(target,subjectScores,totalScore,nextResponses);
  if(JSON.stringify(before)===JSON.stringify(after)) throw badRequest("변경한 내용이 없습니다.");
  const scoreChanged=participant.totalScore!==totalScore;
  const participants=bundle.participants.map(p=>p.id===participant.id ? {...p,studentId:target.id,subjectScores,totalScore,...(scoreChanged?{externalRank:null,regionalRank:null,externalPercentile:null}:{})} : {...p});
  const scores=proof.deletable.map(row=>{
    const old=bundle.participants.find(p=>p.derivedScoreId===row.id)!;
    const next=participants.find(p=>p.id===old.id)!;
    const rank=1+participants.filter(p=>p.totalScore>next.totalScore).length;
    const affected=old.id===participant.id;
    const result:DerivedScore= !affected && (row.subjectId || row.rankInClass===rank) ? {...row} : {...row,studentId:next.studentId,recordedById:affected?actorId:row.recordedById,updatedAt:now,...(row.subjectId ? {score:next.totalScore} : {scores:next.subjectScores,totalScore:next.totalScore,rankInClass:rank})};
    next.derivedScoreSnapshot=derivedScoreSnapshot(result);
    return result;
  });
  return {before,after,participants,scores,responses:[...bundle.responses.filter(r=>r.studentId!==input.studentId),...nextResponses]};
}
