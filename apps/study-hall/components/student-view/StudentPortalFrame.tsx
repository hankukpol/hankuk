import type { ReactNode } from "react";

import { StudentLogoutButton } from "@/components/student-view/StudentLogoutButton";
import { StudentPortalTabs } from "@/components/student-view/StudentPortalTabs";
import {
  getStudentStatusLabel,
  getStudentStatusToneClass,
  getWarningStageLabel,
  getWarningStageToneClass,
} from "@/lib/student-meta";
import type { StudentDetail } from "@/lib/services/student.service";

type StudentPortalFrameProps = {
  division: {
    slug: string;
    name: string;
    fullName: string;
    color: string;
  };
  student: StudentDetail;
  current: "attendance" | "points" | "exams" | "study-ranking";
  title: string;
  description: string;
  attendanceEnabled?: boolean;
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
  pointsEnabled = true,
  examsEnabled = true,
  children,
}: StudentPortalFrameProps) {
  return (
    /* DESIGN.md 5.1 · 8절 — 관리자·조교와 같은 셸을 쓴다.
       학생은 좌측 메뉴가 없으므로 조교와 같은 검은 상단 헤더 + 평면 본문 구성이다. */
    <div className="admin-shell admin-portal flex-col" data-division={division.slug}>
      {/* 검은 헤더는 768px 이상에만. 768 미만은 아래 52px 바가 헤더다 (MOBILE_DESIGN.md 2.1). */}
      <header className="admin-mobile-header hidden md:flex">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight">
            {division.fullName}
          </p>
          <p className="truncate text-[13px] text-white/60">학생 · {student.name}</p>
        </div>

        <div className="shrink-0">
          <StudentLogoutButton divisionSlug={division.slug} />
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-content-frame">
          <div className="admin-flat-page">
            {/* 768px 미만 상단 바 (MOBILE_DESIGN.md 2.1). 지점명·학생명은 아래 요약 격자에 이미 있다. */}
            <div className="admin-mobile-topbar md:hidden">
              <p className="admin-mobile-topbar-title">{title}</p>
              <StudentLogoutButton divisionSlug={division.slug} />
            </div>

            <div className="min-w-0 max-md:hidden">
              <h1 className="admin-page-title break-keep">{title}</h1>
              <p className="admin-help mt-1.5">{description}</p>
            </div>

            {/* DESIGN.md 8절 — 신원 요약은 테두리 상자가 아니라 얇은 선으로만 나눈다. */}
            <dl className="admin-portal-summary admin-portal-summary-3">
              <div>
                <dt>수험번호</dt>
                <dd>{student.studentNumber}</dd>
              </div>
              <div>
                <dt>좌석</dt>
                <dd>{student.seatLabel || "미배정"}</dd>
              </div>
              <div>
                <dt>상벌점</dt>
                <dd>
                  {student.meritPoints !== undefined
                    ? `상점 ${student.meritPoints} · 벌점 ${student.demeritPoints ?? 0}`
                    : `${student.netPoints}점`}
                </dd>
              </div>
              <div>
                <dt>직렬</dt>
                <dd>{student.studyTrack || "미지정"}</dd>
              </div>
              <div>
                <dt>상태</dt>
                <dd className={getStudentStatusToneClass(student.status)}>
                  {getStudentStatusLabel(student.status)}
                </dd>
              </div>
              <div>
                <dt>경고 단계</dt>
                <dd className={getWarningStageToneClass(student.warningStage)}>
                  {student.warningStageLabel ?? getWarningStageLabel(student.warningStage)}
                </dd>
              </div>
            </dl>

            <StudentPortalTabs
              divisionSlug={division.slug}
              current={current}
              attendanceEnabled={attendanceEnabled}
              pointsEnabled={pointsEnabled}
              examsEnabled={examsEnabled}
            />

            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
