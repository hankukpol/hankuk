import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { MakeupNewForm } from "./makeup-new-form";

export const dynamic = "force-dynamic";

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseMakeupDate(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\[MAKEUP:(\d{4}-\d{2}-\d{2})\]/);
  return match ? match[1] : null;
}

function stripMakeupTag(note: string): string {
  return note.replace(/\[MAKEUP:\d{4}-\d{2}-\d{2}]\s*/g, "").trim();
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function MakeupNewPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  // Load cancelled sessions (last 6 months → next 3 months) that don't yet
  // have a makeup date set, or where makeup is still pending
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  from.setHours(0, 0, 0, 0);

  const to = new Date();
  to.setMonth(to.getMonth() + 3);
  to.setHours(23, 59, 59, 999);

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

  const sessions = cancelledSessions.map((s) => {
    const makeupDate = parseMakeupDate(s.note);
    const displayNote = stripMakeupTag(s.note ?? "");
    return {
      id: s.id,
      sessionDate: s.sessionDate.toISOString(),
      startTime: s.startTime,
      endTime: s.endTime,
      subjectName: s.schedule.subjectName,
      instructorName: s.schedule.instructorName ?? null,
      cohortId: s.schedule.cohortId,
      cohortName: s.schedule.cohort.name,
      examCategory: s.schedule.cohort.examCategory,
      makeupDate,
      note: displayNote,
    };
  });

  // Separate sessions: not yet scheduled vs already scheduled
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pendingSessions = sessions.filter((s) => !s.makeupDate);
  const scheduledSessions = sessions.filter((s) => {
    if (!s.makeupDate) return false;
    const dt = new Date(s.makeupDate + "T00:00:00");
    return dt >= today;
  });

  const allAvailable = [...pendingSessions, ...scheduledSessions];

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        출결 관리 &rsaquo; 보강 일정 &rsaquo; 신규 등록
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">보강 일정 신규 등록</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            취소된 강의를 선택하고 보강 날짜와 메모를 설정합니다.
            보강 날짜 지정 후 학생들에게 카카오 알림톡 또는 문자로 안내하세요.
          </p>
        </div>
        <Link
          href="/admin/attendance/makeups"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 보강 일정 목록
        </Link>
      </div>

      {/* Stat summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-[28px] border border-red-200 bg-red-50/60 px-6 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-red-500">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">보강 미설정</p>
            <p className="mt-0.5 text-2xl font-bold text-red-600">
              {pendingSessions.length}
              <span className="ml-1 text-sm font-normal text-red-500">건</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-[28px] border border-amber-200 bg-amber-50/60 px-6 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-amber-600">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">보강 예정</p>
            <p className="mt-0.5 text-2xl font-bold text-amber-700">
              {scheduledSessions.length}
              <span className="ml-1 text-sm font-normal text-amber-600">건</span>
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="mt-8">
        {allAvailable.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-mist">
              <svg className="h-7 w-7 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-base font-medium text-ink">보강 설정이 필요한 취소 강의가 없습니다.</p>
            <p className="mt-2 text-sm text-slate">
              지난 6개월 내 취소된 강의 중 보강 미설정 또는 보강 예정인 건이 없습니다.
            </p>
            <Link
              href="/admin/attendance/makeups"
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:bg-mist"
            >
              보강 목록으로 돌아가기
            </Link>
          </div>
        ) : (
          <MakeupNewForm sessions={allAvailable} />
        )}
      </div>

      {/* Guide */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-mist/40 p-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">보강 일정 등록 안내</h2>
        <ul className="space-y-2 text-xs text-slate">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 font-bold text-ember">1.</span>
            <span>아래 목록에서 보강할 취소 강의를 선택하세요.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 font-bold text-ember">2.</span>
            <span>보강 날짜를 지정합니다. 날짜는 취소일 이후 날짜로 설정하는 것을 권장합니다.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 font-bold text-ember">3.</span>
            <span>메모 필드에 보강 장소나 특이사항을 입력하면 관리에 도움이 됩니다.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 font-bold text-ember">4.</span>
            <span>저장 후 학생들에게 카카오 알림톡이나 문자로 보강 일정을 안내하세요.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
