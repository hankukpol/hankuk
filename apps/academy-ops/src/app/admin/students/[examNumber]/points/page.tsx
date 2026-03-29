import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, PointType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const POINT_TYPE_LABEL: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "개근 포인트",
  SCORE_EXCELLENCE: "성적 우수",
  ESSAY_EXCELLENCE: "에세이 우수",
  MANUAL: "수동 지급",
  USE_PAYMENT: "사용(수강료)",
  USE_RENTAL: "사용(대여)",
  ADJUST: "포인트 조정",
  EXPIRE: "만료",
  REFUND_CANCEL: "취소/환불",
};

const POINT_TYPE_COLOR: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "border-forest/20 bg-forest/10 text-forest",
  SCORE_EXCELLENCE: "border-blue-200 bg-blue-50 text-blue-700",
  ESSAY_EXCELLENCE: "border-purple-200 bg-purple-50 text-purple-700",
  MANUAL: "border-amber-200 bg-amber-50 text-amber-700",
  USE_PAYMENT: "border-red-200 bg-red-50 text-red-700",
  USE_RENTAL: "border-red-200 bg-red-50 text-red-700",
  ADJUST: "border-slate/20 bg-slate/10 text-slate",
  EXPIRE: "border-ink/20 bg-ink/5 text-slate",
  REFUND_CANCEL: "border-purple-200 bg-purple-50 text-purple-700",
};

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${mo}.${day}`;
}

function formatDatetime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${h}:${mi}`;
}

export default async function StudentPointsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { examNumber } = await params;
  const prisma = getPrisma();

  const [student, pointLogs] = await Promise.all([
    prisma.student.findUnique({
      where: { examNumber },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        isActive: true,
      },
    }),
    prisma.pointLog.findMany({
      where: { examNumber },
      include: {
        period: { select: { name: true } },
      },
      orderBy: { grantedAt: "asc" },
    }),
  ]);

  if (!student) notFound();

  // Compute running balance and totals
  let runningBalance = 0;
  const logsWithBalance = pointLogs.map((p) => {
    runningBalance += p.amount;
    return { ...p, runningBalance };
  });

  const currentBalance = runningBalance;
  const totalEarned = pointLogs
    .filter((p) => p.amount > 0)
    .reduce((s, p) => s + p.amount, 0);
  const totalSpent = pointLogs
    .filter((p) => p.amount < 0)
    .reduce((s, p) => s + p.amount, 0);

  // Reverse for display (newest first)
  const displayLogs = [...logsWithBalance].reverse();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumbs */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/students" className="transition hover:text-forest">
          수강생 목록
        </Link>
        <span>/</span>
        <Link
          href={`/admin/students/${examNumber}`}
          className="transition hover:text-forest"
        >
          {student.name}
        </Link>
        <span>/</span>
        <span className="text-ink">포인트</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            포인트 이력
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {student.name}
            <span className="ml-2 text-base font-normal text-slate">
              ({student.examNumber})
            </span>
          </h1>
          {student.phone && (
            <p className="mt-1 text-sm text-slate">{student.phone}</p>
          )}
        </div>
        <Link
          href={`/admin/students/${examNumber}?tab=points`}
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:text-ink"
        >
          ← 학생 프로필
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">
            현재 잔액
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-forest">
            {currentBalance.toLocaleString()}P
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            총 적립
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            +{totalEarned.toLocaleString()}P
          </p>
        </div>
        <div className="rounded-[28px] border border-red-100 bg-red-50 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
            총 사용
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-red-600">
            {totalSpent !== 0
              ? `${totalSpent.toLocaleString()}P`
              : "0P"}
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            총 거래 건수
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {pointLogs.length}건
          </p>
        </div>
      </div>

      {/* Transaction list */}
      <div className="mt-8">
        <h2 className="mb-4 text-base font-semibold text-ink">
          포인트 거래 내역
          <span className="ml-2 text-sm font-normal text-slate">
            ({pointLogs.length}건)
          </span>
        </h2>

        {displayLogs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-16 text-center text-sm text-slate">
            포인트 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  {[
                    "지급일시",
                    "유형",
                    "사유",
                    "기간",
                    "포인트",
                    "누적 잔액",
                    "지급자",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 font-semibold text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {displayLogs.map((p) => {
                  const isPositive = p.amount >= 0;
                  return (
                    <tr key={p.id} className="transition hover:bg-mist/40">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {formatDatetime(p.grantedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${POINT_TYPE_COLOR[p.type]}`}
                        >
                          {POINT_TYPE_LABEL[p.type]}
                        </span>
                      </td>
                      <td className="max-w-[240px] px-4 py-3 text-sm text-ink">
                        {p.reason}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {p.period ? p.period.name : "-"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right tabular-nums font-bold ${
                          isPositive ? "text-forest" : "text-red-600"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {p.amount.toLocaleString()}P
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-ink">
                        {p.runningBalance.toLocaleString()}P
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {p.grantedBy ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Back link */}
      <div className="mt-8">
        <Link
          href={`/admin/students/${examNumber}?tab=points`}
          className="inline-flex items-center gap-1.5 text-sm text-forest transition hover:underline"
        >
          ← 학생 프로필로 이동
        </Link>
      </div>
    </div>
  );
}
