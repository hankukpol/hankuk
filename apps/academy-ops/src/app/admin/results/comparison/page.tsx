import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import ComparisonClient from "./comparison-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  const val = searchParams?.[key];
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

export default async function ComparisonPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  const examNumbersParam = readParam(searchParams, "examNumbers");
  const periodIdStr = readParam(searchParams, "periodId");
  const periodId = periodIdStr ? parseInt(periodIdStr) : null;

  const examNumbers = examNumbersParam
    ? examNumbersParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5)
    : [];

  // Load periods for dropdown
  const periods = await prisma.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isActive: true },
  });

  // Prefetch student names if examNumbers are given
  type StudentInfo = { examNumber: string; name: string };
  let initialStudents: StudentInfo[] = [];
  if (examNumbers.length > 0) {
    initialStudents = await prisma.student.findMany({
      where: { examNumber: { in: examNumbers } },
      select: { examNumber: true, name: true },
    });
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        결과 분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학생 성적 비교</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        최대 5명의 학생을 선택하면 기간별 주차 평균 추이를 같은 차트에 겹쳐 비교할 수 있습니다.
      </p>

      <ComparisonClient
        periods={periods}
        initialPeriodId={periodId}
        initialExamNumbers={examNumbers}
        initialStudents={initialStudents}
      />
    </div>
  );
}
