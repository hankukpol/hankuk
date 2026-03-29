import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, CalendarDays, Clock3, Users } from "lucide-react";

import { getAttendanceSnapshot } from "@/lib/services/attendance.service";
import { getCurrentPeriod, getPeriods } from "@/lib/services/period.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type AssistantPageProps = {
  params: {
    division: string;
  };
};

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function AssistantPage({ params }: AssistantPageProps) {
  const today = getKstToday();
  const settings = await getDivisionFeatureSettings(params.division);
  const attendanceEnabled = settings.featureFlags.attendanceManagement;
  const phoneEnabled = settings.featureFlags.phoneSubmissions;

  if (!attendanceEnabled && phoneEnabled) {
    redirect(`/${params.division}/assistant/phones`);
  }

  if (!attendanceEnabled) {
    return (
      <section className="rounded-[10px] border border-amber-200 bg-amber-50 p-5 text-center shadow-[0_4px_12px_rgba(15,23,42,0.03)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-700">
          조교 도구
        </p>
        <h1 className="mt-2 text-[24px] font-bold tracking-[-0.04em] text-amber-950">
          조교 출결 체크가 비활성화되었습니다.
        </h1>
        <p className="mt-2 text-[13px] leading-5 text-amber-900">
          현재 지점에서는 조교용 출결 체크 기능을 사용하지 않도록 설정했습니다.
          다시 필요해지면 관리자 설정에서 켜 주세요.
        </p>
      </section>
    );
  }

  const [currentPeriod, periods] = await Promise.all([
    getCurrentPeriod(params.division),
    getPeriods(params.division),
  ]);

  const activePeriods = periods.filter((period) => period.isActive);
  const snapshot = currentPeriod
    ? await getAttendanceSnapshot(params.division, today, currentPeriod.id)
    : null;
  const processedCount = snapshot?.records.length ?? 0;
  const totalStudents = snapshot?.students.length ?? 0;
  const remainingCount = Math.max(totalStudents - processedCount, 0);

  return (
    <div className="grid gap-3">
      <section className="rounded-[10px] border border-black/5 bg-white p-4 shadow-[0_4px_12px_rgba(15,23,42,0.03)]">
        <div className="grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
          <div className="rounded-[10px] border border-[#dce8fb] bg-[linear-gradient(135deg,var(--division-color-light)_0%,#ffffff_72%)] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--division-color)]">
              조교
            </p>
            <h1 className="mt-1 text-[24px] font-bold tracking-[-0.04em] text-slate-950">
              조교 출결 체크
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-slate-600">
              현재 교시와 처리 현황을 확인하고 출석 체크를 시작하세요.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Link
                href={`/${params.division}/assistant/check`}
                className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--division-color)] px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90 shadow-sm"
              >
                출석체크 시작
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="rounded-[10px] border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-500">
                {today}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <article className="rounded-[10px] border border-black/5 bg-[#f8fafc] p-4 text-center">
              <div className="flex flex-col items-center gap-1.5 text-slate-500">
                <Clock3 className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">현재 교시</span>
              </div>
              <p className="mt-2.5 text-[19px] font-bold tracking-[-0.04em] text-slate-950">
                {currentPeriod ? currentPeriod.name : "미운영"}
              </p>
              <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                {currentPeriod ? `${currentPeriod.startTime}-${currentPeriod.endTime}` : "종료됨"}
              </p>
            </article>

            <article className="rounded-[10px] border border-black/5 bg-[#f8fafc] p-4 text-center">
              <div className="flex flex-col items-center gap-1.5 text-slate-500">
                <BookOpenCheck className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">처리 현황</span>
              </div>
              <p className="mt-2.5 text-[19px] font-bold tracking-[-0.04em] text-slate-950">
                {currentPeriod ? `${processedCount}/${totalStudents}` : `${activePeriods.length}개`}
              </p>
              <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                {currentPeriod ? `남은인원 ${remainingCount}` : "오늘 총 교시"}
              </p>
            </article>

            <article className="rounded-[10px] border border-black/5 bg-[#f8fafc] p-4 text-center">
              <div className="flex flex-col items-center gap-1.5 text-slate-500">
                <Users className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">대상 인원</span>
              </div>
              <p className="mt-2.5 text-[19px] font-bold tracking-[-0.04em] text-slate-950">
                {totalStudents || "-"}
              </p>
              <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                교시별 학생 수
              </p>
            </article>

            <article className="rounded-[10px] border border-black/5 bg-[#f8fafc] p-4 text-center">
              <div className="flex flex-col items-center gap-1.5 text-slate-500">
                <CalendarDays className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">기타 정보</span>
              </div>
              <p className="mt-2.5 text-[19px] font-bold tracking-[-0.04em] text-slate-950">확인중</p>
              <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                실시간 업데이트
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <article className="rounded-[10px] border border-black/5 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.02)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-600">
            팁
          </p>
          <p className="mt-1.5 text-[13px] font-bold text-slate-900 leading-tight">미처리 필터 활용</p>
          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
            필터로 대기 학생만 빠르게 확인하세요.
          </p>
        </article>

        <article className="rounded-[10px] border border-black/5 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.02)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-600">
            스와이프
          </p>
          <p className="mt-1.5 text-[13px] font-bold text-slate-900 leading-tight">스와이프 입력</p>
          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
            좌우 스와이프로 즉시 처리 가능합니다.
          </p>
        </article>
      </section>
    </div>
  );
}
