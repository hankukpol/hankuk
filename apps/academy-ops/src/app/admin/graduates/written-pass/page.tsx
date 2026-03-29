import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { WrittenPassManager } from "./written-pass-manager";

export const dynamic = "force-dynamic";

export type WrittenPassRow = {
  id: string;
  examNumber: string;
  examName: string;
  writtenPassDate: string | null;
  finalPassDate: string | null;
  note: string | null;
  updatedAt: string;
  createdAt: string;
  student: {
    name: string;
    phone: string | null;
    generation: number | null;
    examType: string;
  };
};

export default async function WrittenPassPage() {
  await requireAdminContext(AdminRole.VIEWER);

  const records = await getPrisma().graduateRecord.findMany({
    where: {
      passType: "WRITTEN_PASS",
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          generation: true,
          examType: true,
        },
      },
    },
    orderBy: { writtenPassDate: "desc" },
  });

  const rows: WrittenPassRow[] = records.map((r) => ({
    id: r.id,
    examNumber: r.examNumber,
    examName: r.examName,
    writtenPassDate: r.writtenPassDate?.toISOString() ?? null,
    finalPassDate: r.finalPassDate?.toISOString() ?? null,
    note: r.note ?? null,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    student: {
      name: r.student.name,
      phone: r.student.phone ?? null,
      generation: r.student.generation,
      examType: r.student.examType,
    },
  }));

  // Stats
  const total = rows.length;
  const pending = rows.filter((r) => !r.finalPassDate).length;
  const finalPassed = rows.filter(
    (r) =>
      r.finalPassDate !== null
  ).length;

  // We track "FINAL_FAIL" outcomes by checking if there's a separate graduate record
  // with passType FINAL_FAIL for the same exam — but we don't have that data here.
  // Instead, just show pending vs concluded (has finalPassDate).

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        판정 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">필기합격자 면접 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        필기시험 합격자의 면접 준비 현황을 관리합니다.
      </p>

      {/* Stats bar */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold text-sky-700">총 필기합격자</p>
          <p className="mt-1 text-3xl font-bold text-sky-800">
            {total}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold text-amber-700">면접 대기중</p>
          <p className="mt-1 text-3xl font-bold text-amber-800">
            {pending}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/10 p-5">
          <p className="text-xs font-semibold text-forest">최종합격</p>
          <p className="mt-1 text-3xl font-bold text-forest">
            {finalPassed}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold text-slate">최종불합격</p>
          <p className="mt-1 text-3xl font-bold text-ink">
            -
            <span className="ml-1 text-sm font-normal text-slate">별도 등록</span>
          </p>
        </div>
      </div>

      <div className="mt-8">
        <WrittenPassManager initialRecords={rows} />
      </div>
    </div>
  );
}
