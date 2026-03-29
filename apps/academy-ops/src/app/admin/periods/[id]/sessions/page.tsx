import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { SessionManager } from "./session-manager";

export const dynamic = "force-dynamic";

export default async function PeriodSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const { id: rawId } = await params;
  const periodId = Number(rawId);
  if (isNaN(periodId)) notFound();

  const db = getPrisma();

  const period = await db.examPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      totalWeeks: true,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
  });

  if (!period) notFound();

  // Get sessions with score counts
  const rawSessions = await db.examSession.findMany({
    where: { periodId },
    orderBy: [{ examType: "asc" }, { examDate: "asc" }, { subject: "asc" }],
    select: {
      id: true,
      examType: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      isCancelled: true,
      cancelReason: true,
      isLocked: true,
      lockedAt: true,
      _count: {
        select: { scores: true },
      },
    },
  });

  const sessions = rawSessions.map((s) => ({
    id: s.id,
    examType: s.examType,
    week: s.week,
    subject: s.subject,
    displaySubjectName: s.displaySubjectName,
    examDate: s.examDate.toISOString(),
    isCancelled: s.isCancelled,
    cancelReason: s.cancelReason,
    isLocked: s.isLocked,
    lockedAt: s.lockedAt?.toISOString() ?? null,
    scoresCount: s._count.scores,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/periods" className="transition hover:text-ember">
          시험 기간 관리
        </Link>
        <span>/</span>
        <Link
          href={`/admin/periods/${period.id}`}
          className="transition hover:text-ember"
        >
          {period.name}
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">회차 관리</span>
      </div>

      {/* Header */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            회차 관리
          </div>
          <h1 className="mt-3 text-3xl font-semibold">{period.name} — 회차 관리</h1>
          <p className="mt-2 text-sm text-slate">
            {formatDate(period.startDate)} ~ {formatDate(period.endDate)} &middot;{" "}
            {period.totalWeeks}주
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/periods/${period.id}`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            ← 기간 상세
          </Link>
        </div>
      </div>

      {/* Info banner */}
      <div className="mt-6 rounded-[20px] border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        <p className="font-semibold">회차 관리 안내</p>
        <ul className="mt-1.5 list-disc pl-5 space-y-1 text-xs leading-5">
          <li>성적이 1건 이상 입력된 회차는 <strong>삭제할 수 없습니다.</strong></li>
          <li>잠긴(🔒) 회차는 삭제할 수 없습니다. 수정 후 삭제하세요.</li>
          <li>직렬(공채/경채)은 회차 추가 시에만 설정 가능하며, 이후 변경되지 않습니다.</li>
          <li>주차(week) 번호는 추가 시에만 지정 가능합니다.</li>
        </ul>
      </div>

      {/* Session manager (client component) */}
      <SessionManager
        period={{
          id: period.id,
          name: period.name,
          totalWeeks: period.totalWeeks,
          isGongchaeEnabled: period.isGongchaeEnabled,
          isGyeongchaeEnabled: period.isGyeongchaeEnabled,
        }}
        sessions={sessions}
      />
    </div>
  );
}
