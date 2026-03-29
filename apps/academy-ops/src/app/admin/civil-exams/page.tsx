import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function calcDaysUntil(date: Date | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatKoreanDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}년 ${m}월 ${d}일`;
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

export default async function CivilExamsHubPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch all active exams
  const allExams = await prisma.civilServiceExam.findMany({
    where: { isActive: true },
    orderBy: [{ writtenDate: "asc" }, { year: "desc" }],
  });

  // Find the next upcoming written exam
  const upcomingExams = allExams.filter((e) => {
    const dates = [e.writtenDate, e.interviewDate, e.resultDate].filter(Boolean) as Date[];
    if (dates.length === 0) return true;
    return dates.some((d) => {
      const t = new Date(d);
      t.setHours(0, 0, 0, 0);
      return t >= today;
    });
  });

  // Find the single most imminent exam (shortest positive daysUntilWritten)
  let heroExam: (typeof allExams)[0] | null = null;
  let heroDays: number | null = null;

  for (const exam of upcomingExams) {
    const d = calcDaysUntil(exam.writtenDate);
    if (d !== null && d >= 0) {
      if (heroDays === null || d < heroDays) {
        heroDays = d;
        heroExam = exam;
      }
    }
  }

  // If no written-date match, pick any upcoming exam
  if (!heroExam && upcomingExams.length > 0) {
    heroExam = upcomingExams[0];
    heroDays = calcDaysUntil(upcomingExams[0].writtenDate);
  }

  // Count exams within 30 days
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);
  const within30Days = allExams.filter((e) => {
    const dates = [e.writtenDate, e.interviewDate, e.resultDate].filter(Boolean) as Date[];
    return dates.some((d) => {
      const t = new Date(d);
      t.setHours(0, 0, 0, 0);
      return t >= today && t <= cutoff;
    });
  }).length;

  // Hero banner style based on urgency
  const isUrgent = heroDays !== null && heroDays <= 14;
  const isVeryUrgent = heroDays !== null && heroDays <= 7;

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시험 관리
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">공무원 시험 관리</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate">
            경찰공무원 시험 일정을 관리하고 수강생에게 알림을 발송합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/settings/civil-exams"
            className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            시험 일정 등록·수정
          </Link>
          <Link
            href="/admin/civil-exams/schedule-alerts"
            className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            알림 발송 관리
          </Link>
        </div>
      </div>

      {/* D-Day Hero Banner */}
      {heroExam ? (
        <div
          className={`mt-8 overflow-hidden rounded-[28px] ${
            isVeryUrgent
              ? "bg-red-600"
              : isUrgent
                ? "bg-amber-500"
                : "bg-forest"
          } p-8 text-white shadow-lg sm:p-10`}
        >
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-80">
                {EXAM_TYPE_LABELS[heroExam.examType] ?? heroExam.examType} · {heroExam.year}년
              </p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{heroExam.name}</h2>
              {heroExam.writtenDate && (
                <p className="mt-2 text-sm opacity-80">
                  필기시험: {formatKoreanDate(heroExam.writtenDate)}
                </p>
              )}
            </div>
            <div className="text-center">
              {heroDays !== null && heroDays >= 0 ? (
                <>
                  <p className="text-sm font-semibold opacity-80">필기시험까지</p>
                  <p
                    className={`mt-1 text-6xl font-black leading-none tracking-tight ${
                      heroDays === 0 ? "animate-pulse" : ""
                    }`}
                  >
                    {heroDays === 0 ? "D-Day!" : `D-${heroDays}`}
                  </p>
                  {isVeryUrgent && heroDays > 0 && (
                    <p className="mt-2 text-xs font-semibold opacity-90">
                      7일 이내 — 최종 점검 필요
                    </p>
                  )}
                </>
              ) : heroDays !== null && heroDays < 0 ? (
                <>
                  <p className="text-sm font-semibold opacity-80">필기시험 경과</p>
                  <p className="mt-1 text-5xl font-black leading-none">
                    D+{Math.abs(heroDays)}
                  </p>
                </>
              ) : (
                <p className="text-lg font-semibold opacity-80">일정 미정</p>
              )}
            </div>
          </div>

          {/* Quick stats strip */}
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/20 pt-5">
            <div className="text-center">
              <p className="text-xs opacity-70">전체 활성 시험</p>
              <p className="mt-1 text-xl font-bold">{allExams.length}건</p>
            </div>
            <div className="text-center">
              <p className="text-xs opacity-70">예정·진행 중</p>
              <p className="mt-1 text-xl font-bold">{upcomingExams.length}건</p>
            </div>
            <div className="text-center">
              <p className="text-xs opacity-70">30일 이내</p>
              <p className={`mt-1 text-xl font-bold ${within30Days > 0 ? "" : "opacity-50"}`}>
                {within30Days}건
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 py-14 text-center">
          <p className="text-sm font-semibold text-ink">예정된 시험이 없습니다</p>
          <p className="mt-2 text-sm text-slate">
            시험 일정을 등록하면 D-day 카운트다운이 표시됩니다.
          </p>
          <Link
            href="/admin/settings/civil-exams"
            className="mt-5 inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
          >
            + 시험 일정 추가
          </Link>
        </div>
      )}

      {/* Upcoming Exam Timeline */}
      {upcomingExams.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">예정·진행 중인 시험</h2>
            <Link
              href="/admin/settings/civil-exams"
              className="text-xs font-semibold text-slate transition hover:text-ink"
            >
              전체 관리 →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {upcomingExams.slice(0, 5).map((exam) => {
              const dWritten = calcDaysUntil(exam.writtenDate);
              const dInterview = calcDaysUntil(exam.interviewDate);
              const nextDays = dWritten !== null && dWritten >= 0
                ? dWritten
                : dInterview !== null && dInterview >= 0
                  ? dInterview
                  : null;
              const urgency =
                nextDays === null
                  ? "default"
                  : nextDays <= 7
                    ? "urgent"
                    : nextDays <= 14
                      ? "warning"
                      : "safe";

              return (
                <div
                  key={exam.id}
                  className={`flex items-center justify-between gap-4 rounded-[20px] border px-5 py-4 ${
                    urgency === "urgent"
                      ? "border-red-200 bg-red-50"
                      : urgency === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-ink/10 bg-white"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          exam.examType === "GONGCHAE"
                            ? "border-forest/20 bg-forest/10 text-forest"
                            : "border-ember/20 bg-ember/10 text-ember"
                        }`}
                      >
                        {EXAM_TYPE_LABELS[exam.examType] ?? exam.examType}
                      </span>
                      <span className="text-sm font-semibold text-ink">{exam.name}</span>
                    </div>
                    {exam.writtenDate && (
                      <p className="mt-1 text-xs text-slate">
                        필기: {formatKoreanDate(exam.writtenDate)}
                        {exam.interviewDate && ` · 면접: ${formatKoreanDate(exam.interviewDate)}`}
                        {exam.resultDate && ` · 발표: ${formatKoreanDate(exam.resultDate)}`}
                      </p>
                    )}
                  </div>
                  {nextDays !== null ? (
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                        nextDays === 0
                          ? "bg-red-600 text-white"
                          : urgency === "urgent"
                            ? "bg-red-100 text-red-700"
                            : urgency === "warning"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-forest/10 text-forest"
                      }`}
                    >
                      {nextDays === 0 ? "D-Day" : `D-${nextDays}`}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-mist px-3 py-1 text-xs font-semibold text-slate">
                      일정 미정
                    </span>
                  )}
                </div>
              );
            })}
            {upcomingExams.length > 5 && (
              <p className="text-center text-xs text-slate">
                외 {upcomingExams.length - 5}건 더 있음 —{" "}
                <Link href="/admin/settings/civil-exams" className="font-semibold text-ink hover:text-forest">
                  전체 보기
                </Link>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Quick action cards */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/settings/civil-exams"
          className="group rounded-[24px] border border-ink/10 bg-white p-6 transition hover:border-forest/30 hover:shadow-sm"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 text-forest"
            >
              <path
                fillRule="evenodd"
                d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h3 className="mt-4 font-semibold text-ink group-hover:text-forest">시험 일정 관리</h3>
          <p className="mt-1.5 text-sm text-slate leading-6">
            공채·경채 시험 일정을 등록하고 날짜를 관리합니다.
          </p>
          <p className="mt-3 text-xs font-semibold text-forest opacity-0 transition group-hover:opacity-100">
            이동하기 →
          </p>
        </Link>

        <Link
          href="/admin/civil-exams/schedule-alerts"
          className="group rounded-[24px] border border-ink/10 bg-white p-6 transition hover:border-ember/30 hover:shadow-sm"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ember/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 text-ember"
            >
              <path d="M4.214 3.227a.75.75 0 0 0-1.156-.956 8.97 8.97 0 0 0-1.856 3.826.75.75 0 0 0 1.466.316 7.47 7.47 0 0 1 1.546-3.186ZM16.942 2.271a.75.75 0 0 0-1.157.956 7.47 7.47 0 0 1 1.547 3.186.75.75 0 0 0 1.466-.316 8.971 8.971 0 0 0-1.856-3.826Z" />
              <path
                fillRule="evenodd"
                d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6Zm0 14.5a2 2 0 0 1-1.95-1.557 33.54 33.54 0 0 0 3.9 0A2 2 0 0 1 10 16.5Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h3 className="mt-4 font-semibold text-ink group-hover:text-ember">알림 발송 관리</h3>
          <p className="mt-1.5 text-sm text-slate leading-6">
            30일 이내 시험 일정을 수강생에게 카카오 알림톡으로 발송합니다.
          </p>
          {within30Days > 0 && (
            <span className="mt-3 inline-flex rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember">
              {within30Days}건 발송 대기
            </span>
          )}
          <p className="mt-3 text-xs font-semibold text-ember opacity-0 transition group-hover:opacity-100">
            이동하기 →
          </p>
        </Link>
      </section>

      {/* Alert presets info card */}
      <section className="mt-6 rounded-[24px] border border-ink/10 bg-mist/60 p-5 sm:p-6">
        <h3 className="font-semibold text-ink">알림 발송 기준 (D-day 기준)</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          {["D-30", "D-14", "D-7", "D-3", "D-1"].map((label) => (
            <span
              key={label}
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm"
            >
              <span className="mr-2 h-2 w-2 rounded-full bg-ember" />
              {label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-6 text-slate">
          위 D-day에 해당하는 날에 알림 발송 버튼을 눌러 수강 동의한 전체 학생에게 카카오 알림톡이 발송됩니다.
          자동 발송은 Cron 스케줄러가 담당합니다.
        </p>
      </section>
    </div>
  );
}
