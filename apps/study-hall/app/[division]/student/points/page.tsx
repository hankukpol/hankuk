import { kstMonthBounds } from "@/lib/management-policy";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import {
  PortalEmptyState,
  PortalMetricCard,
  PortalSectionHeader,
  portalMetricGrid3Class,
} from "@/components/student-view/StudentPortalUi";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { getNextWarningStage, toDemeritPoints } from "@/lib/student-meta";
import { listPointRecords } from "@/lib/services/point.service";
import { getDivisionFeatureSettings, getDivisionRuleSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";
import { isInStudentPointPeriod, studentPointPeriod } from "@/lib/student-point-period";
import { POINT_WORDS } from "@/lib/student-words";

type StudentPointsPageProps = {
  params: {
    division: string;
  };
  searchParams?: {
    range?: string;
  };
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function StudentPointsPage({ params, searchParams }: StudentPointsPageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const [division, student, settings, rules] = await Promise.all([
      getDivisionTheme(params.division),
      getStudentDetail(params.division, session.studentId),
      getDivisionFeatureSettings(params.division),
      getDivisionRuleSettings(params.division),
    ]);

    if (!settings.featureFlags.pointManagement) {
      redirect(`/${params.division}/student`);
    }

    const records = await listPointRecords(params.division, { studentId: session.studentId });
    const demeritPoints = student.demeritPoints ?? toDemeritPoints(student.netPoints);
    const period = studentPointPeriod(student, kstMonthBounds());
    const pointPeriodLabel = period.label;
    const metricRecords = records.filter((record) => isInStudentPointPeriod(record.date, period));
    // 위 숫자와 같은 기간을 표의 기본값으로 둔다. 기간이 없는 학원은 처음부터 전체 기록이다.
    const showAll = !period.scoped || searchParams?.range === "all";
    const tableRecords = showAll ? records : metricRecords;
    const policyHref = student.warningStageLabels ? `/${params.division}/student/management-policy` : null;

    const rewardCount = metricRecords.filter((record) => record.points > 0).length;
    const penaltyCount = metricRecords.filter((record) => record.points < 0).length;

    // 학생에게 필요한 건 지금 몇 점인지보다 다음 단계까지 몇 점 남았는지다.
    // 최고 단계에 닿으면 남은 점수가 없으므로 기존 기준 문구로 돌아간다.
    const nextStage = getNextWarningStage(demeritPoints, rules, student.warningStageLabels);
    const demeritCaption = [
      student.meritPoints !== undefined ? `${pointPeriodLabel} 벌점` : student.pointMetricScope ? `${pointPeriodLabel} ${POINT_WORDS.offset}` : null,
      nextStage ? POINT_WORDS.nextStage(nextStage.label, nextStage.pointsRemaining) : null,
    ].filter(Boolean).join(" · ") || undefined;

    return (
      <StudentPortalFrame
        division={{ slug: params.division, ...division }}
        student={student}
        current="points"
        attendanceEnabled={settings.featureFlags.attendanceManagement}
        pointsEnabled={settings.featureFlags.pointManagement}
        examsEnabled={settings.featureFlags.examManagement}
        title="상벌점 상세"
      >
        <section className={portalMetricGrid3Class}>
          <PortalMetricCard
            label="현재 벌점"
            value={`${demeritPoints}점`}
            caption={demeritCaption}
          />
          <PortalMetricCard
            label={student.meritPoints !== undefined ? `${pointPeriodLabel} 상점` : "상점 기록"}
            value={student.meritPoints !== undefined ? `${student.meritPoints}점` : `${rewardCount}건`}
            caption={student.meritPoints !== undefined ? POINT_WORDS.separate : period.scoped ? `${pointPeriodLabel} 받은 상점 건수` : "지금까지 받은 상점 건수"}
            valueToneClassName="text-admin-success"
          />
          <PortalMetricCard
            label={student.meritPoints !== undefined ? `${pointPeriodLabel} 벌점 기록` : "벌점 기록"}
            value={`${penaltyCount}건`}
            caption={period.scoped ? `${pointPeriodLabel} 받은 벌점 건수` : "지금까지 받은 벌점 건수"}
            valueToneClassName="text-admin-danger"
          />
        </section>

        {/* DESIGN.md 8절 — 학생 목록은 폭에 상관없이 표다. 바깥에 카드를 덧대지 않는다. */}
        <section>
          <PortalSectionHeader
            title="상벌점 기록"
            icon={<ShieldAlert className="h-5 w-5" />}
            action={policyHref ? (
              <Link className="admin-button admin-button-compact" href={policyHref} prefetch={false}>
                벌점 기준 보기
              </Link>
            ) : undefined}
          />

          {period.scoped ? (
            <nav className="admin-subtabs mt-4" aria-label="상벌점 기록 기간">
              <Link className="admin-subtab" href={`/${params.division}/student/points`} prefetch={false} aria-current={!showAll ? "page" : undefined}>
                {pointPeriodLabel} 기록 {metricRecords.length}
              </Link>
              <Link className="admin-subtab" href={`/${params.division}/student/points?range=all`} prefetch={false} aria-current={showAll ? "page" : undefined}>
                전체 기록 {records.length}
              </Link>
            </nav>
          ) : null}

          {/* 640px 미만에서는 일시·점수·사유 셋만 남긴다. 구분과 기록자는 사유 아래로
              접는다 — 다섯 열은 폰 화면 밖으로 나가 사유가 잘린 채 보였다. */}
          {tableRecords.length > 0 ? (
            <div className="admin-table-frame mt-4">
              <table className="w-full">
                <thead>
                  <tr>
                    <th>적용 일시</th>
                    <th className="hidden sm:table-cell">구분</th>
                    <th>점수</th>
                    <th className="admin-table-name">부여 사유</th>
                    <th className="hidden sm:table-cell">기록자</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRecords.map((record) => (
                    <tr key={record.id}>
                      <td>
                        {formatDate(record.date)}
                        <div className="admin-help mt-1 sm:hidden">
                          {formatTime(record.date)}
                        </div>
                        <span className="hidden sm:inline"> {formatTime(record.date)}</span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <PointCategoryBadge category={record.category} />
                      </td>
                      <td>
                        <PointValueBadge points={record.points} />
                      </td>
                      <td className="admin-table-name">
                        {record.ruleName || "직접 기록"}
                        {record.notes ? <p className="admin-help">{record.notes}</p> : null}
                        <p className="admin-help mt-1 sm:hidden">
                          {record.recordedByName}
                        </p>
                      </td>
                      <td className="hidden sm:table-cell">{record.recordedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4">
              <PortalEmptyState
                title={showAll ? "상벌점 기록이 없어요." : `${pointPeriodLabel} 상벌점 기록이 없어요.`}
                description="상점이나 벌점을 받으면 여기에 보여요."
              />
            </div>
          )}
        </section>
      </StudentPortalFrame>
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
