import type { ReactNode } from "react";

import {
  portalContainerClass,
  portalPageClass,
} from "@/components/student-view/StudentPortalUi";
import { StudentLogoutButton } from "@/components/student-view/StudentLogoutButton";
import { StudentPortalTabs } from "@/components/student-view/StudentPortalTabs";
import {
  StudentStatusBadge,
  WarningStageBadge,
} from "@/components/students/StudentBadges";
import type { StudentDetail } from "@/lib/services/student.service";

type StudentPortalFrameProps = {
  division: {
    slug: string;
    name: string;
    fullName: string;
    color: string;
  };
  student: StudentDetail;
  current:
    | "dashboard"
    | "attendance"
    | "points"
    | "exams"
    | "announcements"
    | "study-ranking";
  title: string;
  description: string;
  attendanceEnabled?: boolean;
  announcementsEnabled?: boolean;
  pointsEnabled?: boolean;
  examsEnabled?: boolean;
  children: ReactNode;
};


export function StudentPortalFrame({
  division,
  student,
  current,
  title,
  description,
  attendanceEnabled = true,
  announcementsEnabled = true,
  pointsEnabled = true,
  examsEnabled = true,
  children,
}: StudentPortalFrameProps) {
  return (
    <main className={portalPageClass}>
      <div className={portalContainerClass}>
        {/* DESIGN.md 5.3 · 7절 — 장식용 색면 대신 선으로 구분한 요약 패널을 쓴다. */}
        <section aria-label={title} className="admin-panel">
          <div className="sr-only">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          <div className="admin-panel-header">
            <div className="min-w-0">
              <p className="break-keep text-[16px] font-bold leading-tight text-admin-text">
                {student.name}
                <span className="ml-1 text-[13px] font-normal text-admin-text-muted">학생님</span>
              </p>
              <p className="mt-1 break-keep text-[13px] text-admin-text-muted">
                {division.fullName}
              </p>
            </div>
            <div className="shrink-0">
              <StudentLogoutButton divisionSlug={division.slug} />
            </div>
          </div>

          <div className="px-5 py-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="min-w-0 space-y-2">
                <dt className="admin-metric-box-label">학번</dt>
                <dd className="admin-metric-box-value">{student.studentNumber}</dd>
              </div>
              <div className="min-w-0 space-y-2">
                <dt className="admin-metric-box-label">좌석</dt>
                <dd className="admin-metric-box-value">{student.seatLabel || "미배정"}</dd>
              </div>
              <div className="min-w-0 space-y-2">
                <dt className="admin-metric-box-label">상벌점</dt>
                <dd className="admin-metric-box-value">{student.meritPoints !== undefined ? <><span className="block whitespace-nowrap">상점 {student.meritPoints}점</span><span className="block whitespace-nowrap">벌점 {student.demeritPoints ?? 0}점</span></> : `${student.netPoints}점`}</dd>
              </div>
              <div className="min-w-0 space-y-2">
                <dt className="admin-metric-box-label">직렬</dt>
                <dd className="admin-metric-box-value">{student.studyTrack || "미지정"}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <StudentStatusBadge status={student.status} />
              <WarningStageBadge stage={student.warningStage} label={student.warningStageLabel} />
            </div>
          </div>
        </section>

        <StudentPortalTabs
          divisionSlug={division.slug}
          current={current}
          attendanceEnabled={attendanceEnabled}
          announcementsEnabled={announcementsEnabled}
          pointsEnabled={pointsEnabled}
          examsEnabled={examsEnabled}
        />
        {children}
      </div>
    </main>
  );
}
