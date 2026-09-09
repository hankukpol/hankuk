import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getAttendanceSnapshot } from "@/lib/services/attendance.service";
import { getCurrentPeriod, getPeriods, type PeriodRecord } from "@/lib/services/period.service";
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
      <div className="admin-flat-page">
        <section className="admin-section">
          <h1 className="admin-page-title">조교 출결 체크</h1>
          <p className="admin-page-description">
            현재 지점에서는 조교용 출결 체크 기능을 사용하지 않도록 설정했습니다.
          </p>
        </section>

        <div className="admin-notice admin-notice-warning">
          조교 출결 체크가 비활성화되었습니다. 다시 필요해지면 관리자 설정에서 켜 주세요.
        </div>
      </div>
    );
  }

  const [currentPeriod, periods] = await Promise.all([
    getCurrentPeriod(params.division),
    getPeriods(params.division),
  ]);

  const activePeriods = periods.filter((period: PeriodRecord) => period.isActive);
  const snapshot = currentPeriod
    ? await getAttendanceSnapshot(params.division, today, currentPeriod.id)
    : null;
  const processedCount = snapshot?.records.length ?? 0;
  const totalStudents = snapshot?.students.length ?? 0;
  const remainingCount = Math.max(totalStudents - processedCount, 0);

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <h1 className="admin-page-title">조교 출결 체크</h1>
        <p className="admin-page-description">
          현재 교시와 처리 현황을 확인하고 출석 체크를 시작하세요.
        </p>

        <div className="admin-workspace-toolbar">
          <p className="admin-help">
            {today} ·{" "}
            {currentPeriod
              ? `${currentPeriod.name} 진행 중 (${currentPeriod.startTime}–${currentPeriod.endTime})`
              : "현재 진행 중인 교시가 없습니다."}
          </p>

          <Link
            href={`/${params.division}/assistant/check`}
            className="admin-button admin-button-primary"
          >
            출석체크 시작
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* DESIGN.md 5.3 — 관리자 대시보드와 같은 KPI 격자. 768px 미만 2열, 1280px 이상 4열. */}
      <section className="admin-dashboard-metrics">
        {/* KPI 값은 수치다. 교시 이름 같은 글자를 32px 로 키우면 화면이 그 한 칸에 눌린다.
            현재 교시는 위 안내 줄에서 이미 알려준다 (DESIGN.md 3 · 5.3). */}
        <article className="admin-dashboard-metric">
          <p className="admin-dashboard-metric-label">오늘 교시</p>
          <p className="admin-dashboard-metric-value">
            {activePeriods.length}
            <span className="admin-dashboard-metric-unit">개</span>
          </p>
          <p className="admin-help mt-3">
            {currentPeriod ? `현재 ${currentPeriod.name} 진행 중` : "운영 시간 종료"}
          </p>
        </article>

        <article className="admin-dashboard-metric">
          <p className="admin-dashboard-metric-label">처리 현황</p>
          <p className="admin-dashboard-metric-value">
            {processedCount}
            <span className="admin-dashboard-metric-unit">/ {totalStudents}명</span>
          </p>
          <p className="admin-help mt-3">
            {currentPeriod ? `미처리 ${remainingCount}명` : "진행 중인 교시 없음"}
          </p>
        </article>

        <article className="admin-dashboard-metric">
          <p className="admin-dashboard-metric-label">대상 인원</p>
          <p className="admin-dashboard-metric-value">
            {totalStudents}
            <span className="admin-dashboard-metric-unit">명</span>
          </p>
          <p className="admin-help mt-3">
            {currentPeriod ? "현재 교시 출결 대상" : "교시를 선택하면 집계됩니다"}
          </p>
        </article>

        <article className="admin-dashboard-metric">
          <p className="admin-dashboard-metric-label">남은 처리</p>
          <p className="admin-dashboard-metric-value">
            {currentPeriod ? remainingCount : 0}
            <span className="admin-dashboard-metric-unit">명</span>
          </p>
          <p className="admin-help mt-3">
            {currentPeriod && remainingCount > 0 ? "출석체크에서 바로 처리" : "처리할 학생 없음"}
          </p>
        </article>
      </section>
    </div>
  );
}
