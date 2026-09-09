import { kstMonthBounds } from "@/lib/management-policy";
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

type StudentPointsPageProps = {
  params: {
    division: string;
  };
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function StudentPointsPage({ params }: StudentPointsPageProps) {
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
    const month = kstMonthBounds();
    const metricRecords = student.meritPoints !== undefined ? records.filter((r) => r.date.slice(0, 10) >= month.dateFrom && r.date.slice(0, 10) <= month.dateTo) : records;

    const rewardCount = metricRecords.filter((record) => record.points > 0).length;
    const penaltyCount = metricRecords.filter((record) => record.points < 0).length;

    // 학생에게 필요한 건 지금 몇 점인지보다 다음 단계까지 몇 점 남았는지다.
    // 최고 단계에 닿으면 남은 점수가 없으므로 기존 기준 문구로 돌아간다.
    const nextStage = getNextWarningStage(demeritPoints, rules, student.warningStageLabels);
    const demeritCaption = [
      student.meritPoints !== undefined ? "이번 달 벌점, 상점과 별도 집계" : null,
      nextStage ? `${nextStage.label}까지 ${nextStage.pointsRemaining}점` : "경고 단계 반영 기준",
    ].filter(Boolean).join(" · ");

    return (
      <StudentPortalFrame
        division={{ slug: params.division, ...division }}
        student={student}
        current="points"
        attendanceEnabled={settings.featureFlags.attendanceManagement}
        pointsEnabled={settings.featureFlags.pointManagement}
        examsEnabled={settings.featureFlags.examManagement}
        title="상벌점 상세"
        description="학생 본인에게 등록된 가점과 벌점 기록을 시간순으로 압축해 확인할 수 있습니다."
      >
        <section className={portalMetricGrid3Class}>
          <PortalMetricCard
            label="현재 벌점"
            value={`${demeritPoints}점`}
            caption={demeritCaption}
          />
          <PortalMetricCard
            label={student.meritPoints !== undefined ? "이번 달 상점" : "가점 기록"}
            value={student.meritPoints !== undefined ? `${student.meritPoints}점` : `${rewardCount}건`}
            caption={student.meritPoints !== undefined ? "벌점과 상계하지 않습니다" : "현재 누적된 가점 건수"}
            valueToneClassName="text-admin-success"
          />
          <PortalMetricCard
            label={student.meritPoints !== undefined ? "이번 달 벌점 기록" : "벌점 기록"}
            value={`${penaltyCount}건`}
            caption={student.meritPoints !== undefined ? "이번 달 확정된 벌점 건수" : "현재 누적된 벌점 건수"}
            valueToneClassName="text-admin-danger"
          />
        </section>

        {/* DESIGN.md 8절 — 학생 목록은 폭에 상관없이 표다. 바깥에 카드를 덧대지 않는다. */}
        <section>
          <PortalSectionHeader
            title="전체 상벌점 기록"
            description="최근순으로 정렬되며, 항목과 기록 메모를 한 화면에서 빠르게 확인할 수 있습니다."
            icon={<ShieldAlert className="h-5 w-5" />}
          />

          {records.length > 0 ? (
            <div className="admin-table-frame mt-4">
              <table>
                <thead>
                  <tr>
                    <th>적용 일시</th>
                    <th>구분</th>
                    <th>점수</th>
                    <th>부여 사유</th>
                    <th>기록자</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDateTime(record.date)}</td>
                      <td>
                        <PointCategoryBadge category={record.category} />
                      </td>
                      <td>
                        <PointValueBadge points={record.points} />
                      </td>
                      <td className="admin-table-name">
                        {record.ruleName || "직접 기록"}
                        <p className="admin-help">
                          {record.notes || "기록 메모가 없습니다."}
                        </p>
                      </td>
                      <td>{record.recordedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4">
              <PortalEmptyState
                title="상벌점 기록이 없습니다."
                description="등록된 가점 또는 벌점 이력이 생기면 이 영역에 표시됩니다."
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
