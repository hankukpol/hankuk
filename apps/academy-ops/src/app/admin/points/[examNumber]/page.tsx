import { AdminRole, PointType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StudentPointDetail } from "./student-point-detail";

export const dynamic = "force-dynamic";

const POINT_TYPE_LABEL: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "개근",
  SCORE_EXCELLENCE: "성적 우수",
  ESSAY_EXCELLENCE: "논술 우수",
  MANUAL: "수동 지급",
  USE_PAYMENT: "사용(수강료)",
  USE_RENTAL: "사용(대여)",
  ADJUST: "포인트 조정",
  EXPIRE: "만료",
  REFUND_CANCEL: "취소/환불",
};

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

export default async function StudentPointPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { examNumber } = await params;

  const prisma = getPrisma();

  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: { name: true, examNumber: true, phone: true, isActive: true },
  });

  if (!student) notFound();

  const [balanceAgg, logs] = await Promise.all([
    prisma.pointLog.aggregate({
      where: { examNumber },
      _sum: { amount: true },
    }),
    prisma.pointLog.findMany({
      where: { examNumber },
      orderBy: { grantedAt: "desc" },
      take: 50,
    }),
  ]);

  const balance = balanceAgg._sum.amount ?? 0;

  const logRows = logs.map((log) => ({
    id: log.id,
    type: log.type,
    amount: log.amount,
    reason: log.reason,
    grantedAt: log.grantedAt.toISOString(),
    grantedBy: log.grantedBy,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* 브레드크럼 */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/points" className="hover:text-forest transition-colors">
          포인트 현황
        </Link>
        <span>/</span>
        <span className="text-ink">{student.name}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            학생 포인트
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {student.name}
            <span className="ml-2 text-base font-normal text-slate">({student.examNumber})</span>
          </h1>
          {student.phone && (
            <p className="mt-1 text-sm text-slate">{student.phone}</p>
          )}
        </div>

        {/* 잔액 배지 */}
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 px-6 py-4 text-right">
          <p className="text-xs font-medium text-slate">현재 잔액</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-forest">
            {balance.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">P</span>
          </p>
        </div>
      </div>

      <div className="mt-8">
        <StudentPointDetail
          examNumber={examNumber}
          initialLogs={logRows}
          initialBalance={balance}
          pointTypeLabelMap={POINT_TYPE_LABEL}
        />
      </div>

      <div className="mt-6">
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center gap-1.5 text-sm text-forest hover:underline"
        >
          ← 학생 프로필로 이동
        </Link>
      </div>
    </div>
  );
}
