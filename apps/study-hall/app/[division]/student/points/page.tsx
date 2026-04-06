import { notFound, redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import {
  PortalEmptyState,
  PortalMetricCard,
  PortalSectionHeader,
  portalInsetClass,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { toDemeritPoints } from "@/lib/student-meta";
import { listPointRecords } from "@/lib/services/point.service";
import { getDivisionFeatureSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";

type StudentPointsPageProps = {
  params: {
    division: string;
  };
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function StudentPointsPage({ params }: StudentPointsPageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const [division, student, settings] = await Promise.all([
      getDivisionTheme(params.division),
      getStudentDetail(params.division, session.studentId),
      getDivisionFeatureSettings(params.division),
    ]);

    if (!settings.featureFlags.pointManagement) {
      redirect(`/${params.division}/student`);
    }

    const records = await listPointRecords(params.division, { studentId: session.studentId });
    const demeritPoints = toDemeritPoints(student.netPoints);

    const rewardCount = records.filter((record) => record.points > 0).length;
    const penaltyCount = records.filter((record) => record.points < 0).length;

    return (
      <StudentPortalFrame
        division={{ slug: params.division, ...division }}
        student={student}
        current="points"
        attendanceEnabled={settings.featureFlags.attendanceManagement}
        announcementsEnabled={settings.featureFlags.announcements}
        pointsEnabled={settings.featureFlags.pointManagement}
        examsEnabled={settings.featureFlags.examManagement}
        title="상벌점 상세"
        description="학생 본인에게 등록된 가점과 벌점 기록을 시간순으로 압축해 확인할 수 있습니다."
      >
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <PortalMetricCard
            label="현재 벌점"
            value={`${demeritPoints}점`}
            caption="경고 단계 반영 기준"
          />
          <PortalMetricCard
            label="가점 기록"
            value={`${rewardCount}건`}
            caption="현재 누적된 가점 건수"
            valueToneClassName="text-emerald-700"
          />
          <PortalMetricCard
            label="벌점 기록"
            value={`${penaltyCount}건`}
            caption="현재 누적된 벌점 건수"
            valueToneClassName="text-rose-700"
          />
        </section>

        <section className={portalSectionClass}>
          <PortalSectionHeader
            title="전체 상벌점 기록"
            description="최근순으로 정렬되며, 항목과 기록 메모를 한 화면에서 빠르게 확인할 수 있습니다."
            icon={<ShieldAlert className="h-5 w-5" />}
          />

          {records.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {records.map((record) => (
                <article key={record.id} className={portalInsetClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <PointCategoryBadge category={record.category} />
                        <PointValueBadge points={record.points} />
                      </div>
                      <p className="mt-2 text-[15px] font-semibold text-[var(--foreground)]">
                        {record.ruleName || "직접 기록"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        기록자 {record.recordedByName}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--muted)]">{formatDateTime(record.date)}</span>
                  </div>
                  <p className="mt-3 text-[13px] leading-[1.5] text-[var(--muted)]">
                    {record.notes || "기록 메모가 없습니다."}
                  </p>
                </article>
              ))}
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
