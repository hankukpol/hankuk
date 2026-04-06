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
        <section
          aria-label={title}
          className="relative overflow-hidden rounded-[10px] shadow-header"
          style={{
            background: "var(--division-color)",
            color: "white",
          }}
        >
          <div className="sr-only">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          <div className="relative px-4 py-4 md:p-5">
            {/* Header: Identity & Logout */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                 </div>
                 <div className="min-w-0">
                   <p className="truncate text-[15px] font-bold leading-tight">
                     {student.name}
                     <span className="ml-1 text-[12px] font-normal text-white/60">학생님</span>
                   </p>
                   <p className="mt-0.5 truncate text-[12px] font-medium text-white/50">{division.fullName}</p>
                 </div>
              </div>
              <div className="shrink-0">
                <StudentLogoutButton divisionSlug={division.slug} isPill />
              </div>
            </div>

            {/* Stats Row */}
            <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3.5">
              <div className="flex flex-col">
                <p className="text-[11px] font-medium text-white/50">학번</p>
                <p className="mt-0.5 text-[15px] font-bold text-white">{student.studentNumber}</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="text-[11px] font-medium text-white/50">좌석</p>
                <p className="mt-0.5 text-[15px] font-bold text-white">{student.seatLabel || "미배정"}</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="text-[11px] font-medium text-white/50">상벌점</p>
                <p className="mt-0.5 text-[15px] font-bold text-white">{student.netPoints}점</p>
              </div>
              <div className="flex flex-col items-end">
                <p className="text-[11px] font-medium text-white/50">직렬</p>
                <p className="mt-0.5 text-[15px] font-bold text-white">{student.studyTrack || "경찰"}</p>
              </div>
            </div>

            {/* Badges */}
            <div className="mt-3.5 flex flex-wrap gap-1.5">
               <StudentStatusBadge status={student.status} />
               <WarningStageBadge stage={student.warningStage} />
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
