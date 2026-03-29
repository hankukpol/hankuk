import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { CivilExamManager } from "./civil-exam-manager";

export const dynamic = "force-dynamic";

export type CivilExamRow = {
  id: number;
  name: string;
  examType: "GONGCHAE" | "GYEONGCHAE";
  year: number;
  writtenDate: string | null;
  interviewDate: string | null;
  resultDate: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

export default async function CivilExamsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const exams = await getPrisma().civilServiceExam.findMany({
    orderBy: [{ year: "desc" }, { examType: "asc" }, { createdAt: "asc" }],
  });

  const rows: CivilExamRow[] = exams.map((e) => ({
    id: e.id,
    name: e.name,
    examType: e.examType as "GONGCHAE" | "GYEONGCHAE",
    year: e.year,
    writtenDate: e.writtenDate ? e.writtenDate.toISOString().split("T")[0] : null,
    interviewDate: e.interviewDate ? e.interviewDate.toISOString().split("T")[0] : null,
    resultDate: e.resultDate ? e.resultDate.toISOString().split("T")[0] : null,
    description: e.description,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">공무원 시험 일정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        공채·경채 공무원 시험 일정을 등록하고 관리합니다.
        등록된 시험은 합격자 등록 및 성적 분석 화면에서 참조됩니다.
      </p>
      <div className="mt-8">
        <CivilExamManager initialExams={rows} />
      </div>
    </div>
  );
}
