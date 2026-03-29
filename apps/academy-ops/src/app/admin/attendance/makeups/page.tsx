import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { MakeupClient, type MakeupRow } from "./makeup-client";

export const dynamic = "force-dynamic";

// ─── Helpers (duplicated from API to avoid cross-import) ──────────────────────

function parseMakeupDate(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\[MAKEUP:(\d{4}-\d{2}-\d{2})\]/);
  return match ? match[1] : null;
}

function stripMakeupTag(note: string): string {
  return note.replace(/\[MAKEUP:\d{4}-\d{2}-\d{2}\]\s*/g, "").trim();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MakeupsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  // Date range: last 6 months to next 3 months
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  from.setHours(0, 0, 0, 0);

  const to = new Date();
  to.setMonth(to.getMonth() + 3);
  to.setHours(23, 59, 59, 999);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Load cancelled sessions
  const cancelledSessions = await prisma.lectureSession.findMany({
    where: {
      isCancelled: true,
      sessionDate: { gte: from, lte: to },
    },
    include: {
      schedule: {
        include: {
          cohort: { select: { id: true, name: true, examCategory: true } },
        },
      },
    },
    orderBy: { sessionDate: "desc" },
  });

  // Load all active cohorts for filter
  const cohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Build rows
  const rows: MakeupRow[] = cancelledSessions.map((s) => {
    const makeupDate = parseMakeupDate(s.note);
    const displayNote = stripMakeupTag(s.note ?? "");

    let makeupStatus: MakeupRow["makeupStatus"] = "pending";
    if (makeupDate) {
      const makeupDt = new Date(makeupDate + "T00:00:00");
      makeupStatus = makeupDt < today ? "completed" : "scheduled";
    }

    return {
      id: s.id,
      sessionDate: s.sessionDate.toISOString(),
      startTime: s.startTime,
      endTime: s.endTime,
      subjectName: s.schedule.subjectName,
      instructorName: s.schedule.instructorName ?? null,
      cohortId: s.schedule.cohortId,
      cohortName: s.schedule.cohort.name,
      makeupDate,
      makeupStatus,
      note: displayNote,
    };
  });

  // Summary counts
  const pendingCount = rows.filter((r) => r.makeupStatus === "pending").length;
  const scheduledCount = rows.filter((r) => r.makeupStatus === "scheduled").length;
  const totalCancelled = rows.length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        출결 관리 &rsaquo; 보강 일정
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">보강 일정 관리</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            취소된 강의 세션을 조회하고 보강 날짜를 설정합니다.
            보강 날짜가 지나면 자동으로 완료 처리됩니다.
          </p>
        </div>
        <Link
          href="/admin/attendance/lecture"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
        >
          강의 출결 관리
        </Link>
      </div>

      {/* Info banner if there are pending makeups */}
      {pendingCount > 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-800">
              보강 날짜 미설정 강의가 {pendingCount}건 있습니다.
            </p>
            <p className="mt-0.5 text-xs text-red-700">
              취소된 강의에 보강 날짜를 설정하여 학생들에게 안내해 주세요.
              전체 취소 강의 {totalCancelled}건 중 {scheduledCount}건은 보강 예정으로 설정되어 있습니다.
            </p>
          </div>
        </div>
      )}

      {totalCancelled === 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-forest/20 bg-forest/5 p-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 flex-shrink-0 text-forest">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-forest">
            최근 9개월 내 취소된 강의가 없습니다.
          </p>
        </div>
      )}

      {/* Client component with interactive table */}
      <div className="mt-8">
        <MakeupClient
          initialRows={rows}
          cohorts={cohorts}
        />
      </div>

      {/* Guide box */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-mist/40 p-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">보강 일정 관리 안내</h2>
        <ul className="space-y-2 text-xs text-slate">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 font-bold text-red-500">•</span>
            <span><strong className="text-ink">보강 미정</strong>: 강의가 취소되었으나 보강 날짜가 아직 설정되지 않은 건. 빠른 설정이 필요합니다.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 font-bold text-amber-500">•</span>
            <span><strong className="text-ink">보강 예정</strong>: 보강 날짜가 설정되어 있으며, 해당 날짜가 오늘 이후인 건.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 font-bold text-forest">•</span>
            <span><strong className="text-ink">보강 완료</strong>: 보강 날짜가 설정되어 있으며, 해당 날짜가 오늘 이전인 건. 보강이 완료된 것으로 간주합니다.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 font-bold text-slate">•</span>
            <span>조회 범위: 최근 6개월 ~ 향후 3개월 내 취소된 강의 세션</span>
          </li>
        </ul>
      </div>

      {/* Footer nav */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/attendance"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 출결 관리 허브
        </Link>
        <Link
          href="/admin/attendance/lecture"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-5 py-2.5 text-sm font-medium text-forest transition hover:bg-forest/10"
        >
          강의 출결 관리
        </Link>
        <Link
          href="/admin/attendance/lecture/reports"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          강의 출결 리포트
        </Link>
      </div>
    </div>
  );
}
