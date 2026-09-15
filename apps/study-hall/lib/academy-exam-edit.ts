import type { AcademyConfiguration } from "./academy-template";
import { examTypeSchema } from "./exam-schemas";
import { notFound } from "./errors";

/** Reuse the existing exam form/schema while retaining archived subject identities. */
export function editAcademyExam(current: AcademyConfiguration, id: string | null, value: unknown): AcademyConfiguration {
  const input=examTypeSchema.parse(value), existing=id?current.examTypes.find(e=>e.id===id):null;
  if(id && !existing)throw notFound("시험 종류를 찾을 수 없습니다.");
  if(input.subjects.some(s=>s.id && !existing?.subjects.some(old=>old.id===s.id)))throw notFound("이 시험의 과목을 찾을 수 없습니다.");
  const subjects=input.subjects.map((s,index)=>({...s,id:s.id??crypto.randomUUID(),totalItems:s.totalItems??null,pointsPerItem:s.pointsPerItem??null,alternateGroup:s.alternateGroup??null,isActive:s.isActive??true,displayOrder:index}));
  for(const old of existing?.subjects??[])if(!subjects.some(s=>s.id===old.id))subjects.push({...old,isActive:false});
  const next={...input,id:id??crypto.randomUUID(),studyTrack:input.studyTrack??null,isActive:input.isActive??true,displayOrder:existing?.displayOrder??current.examTypes.length,subjects};
  return {...current,examTypes:id?current.examTypes.map(e=>e.id===id?next:e):[...current.examTypes,next]};
}
