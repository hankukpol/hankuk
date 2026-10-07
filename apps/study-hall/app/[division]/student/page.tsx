import Link from "next/link";
import { notFound } from "next/navigation";
import { GraduationCap, Megaphone, ShieldAlert } from "lucide-react";

import { PointValueBadge } from "@/components/points/PointBadges";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import { StudentStudyTasks } from "@/components/student-view/StudentStudyTasks";
import {
  PortalMetricCard,
  PortalSectionHeader,
  portalMetricGrid3Class,
  portalMetricGridClass,
} from "@/components/student-view/StudentPortalUi";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { listStudentVisibleTasks } from "@/lib/services/interview.service";
import { getStudentDashboardData } from "@/lib/services/student-dashboard.service";
import { toDemeritPoints } from "@/lib/student-meta";
import { POINT_WORDS } from "@/lib/student-words";

type StudentHomePageProps = {
  params: {
    division: string;
  };
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}

/**
 * 학생 홈(운영자 요청 2026-10-07). 로그인하면 오늘 확인할 것을 한 화면에서 본다.
 * 새 계산을 만들지 않는다 — 출석·벌점·공부 시간·공지·시험 일정은 모두 기존 getStudentDashboardData 값이고,
 * 맨 위 할 일은 학습 면담에서 공개로 정한 것만이다(listStudentVisibleTasks).
 * 각 묶음은 그 기능이 켜진 학원에서만 보인다.
 */
export default async function StudentHomePage({ params }: StudentHomePageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const data = await getStudentDashboardData(params.division, session.studentId);
    const flags = data.featureFlags;
    // 학습 면담에서 선생님과 정한 할 일이 있으면 홈 맨 위에 둔다(면담 내용은 내려오지 않는다).
    const studyTasks = flags.interviewManagement ? await listStudentVisibleTasks(params.division, session.studentId) : [];
    const base = `/${params.division}/student`;
    const demerit = data.student.demeritPoints ?? toDemeritPoints(data.student.netPoints);
    const enrollment = data.enrollment;
    const enrollmentUrgent = enrollment ? enrollment.daysRemaining <= enrollment.expirationWarningDays : false;

    const metrics = [
      flags.attendanceManagement ? (
        <PortalMetricCard
          key="attendance"
          label="이번 주 출석"
          value={`${data.summary.weeklyAttendedCount} / ${data.summary.weeklyExpectedCount}교시`}
          caption={`이번 달 출석률 ${data.summary.monthlyAttendanceRate}%`}
        />
      ) : null,
      flags.pointManagement ? (
        <PortalMetricCard
          key="points"
          label="벌점"
          value={`${demerit}점`}
          caption={data.nextWarningStage ? POINT_WORDS.nextStage(data.nextWarningStage.label, data.nextWarningStage.pointsRemaining) : undefined}
          valueToneClassName={demerit > 0 ? "text-admin-danger" : "text-admin-text"}
        />
      ) : null,
      <PortalMetricCard
        key="study"
        label="이번 달 공부 시간"
        value={`${data.summary.monthlyStudyHours}시간 ${data.summary.monthlyStudyMinutesRemainder}분`}
      />,
      enrollment ? (
        <PortalMetricCard
          key="enrollment"
          label="수강 남은 날"
          value={enrollment.daysRemaining >= 0 ? `${enrollment.daysRemaining}일` : "수강 종료"}
          caption={enrollment.daysRemaining >= 0 ? `${enrollment.courseEndDate}까지${enrollmentUrgent ? " · 곧 끝나요" : ""}` : `${enrollment.courseEndDate}에 끝났어요`}
          valueToneClassName={enrollmentUrgent ? "text-admin-warning" : "text-admin-text"}
        />
      ) : null,
    ].filter(Boolean);

    // 고정 공지를 먼저, 그다음 최근 공지. 같은 공지는 한 번만 보인다.
    const announcements = [
      ...data.pinnedAnnouncements,
      ...data.recentAnnouncements.filter((item) => !data.pinnedAnnouncements.some((pinned) => pinned.id === item.id)),
    ];

    return (
      <StudentPortalFrame
        division={data.division}
        student={data.student}
        current="home"
        attendanceEnabled={flags.attendanceManagement}
        pointsEnabled={flags.pointManagement}
        examsEnabled={flags.examManagement}
        title="홈"
        description="오늘 확인할 것을 모았어요."
      >
        <StudentStudyTasks tasks={studyTasks} />

        <section className={metrics.length === 3 ? portalMetricGrid3Class : portalMetricGridClass} aria-label="이번 주 나">
          {metrics}
        </section>

        {flags.announcements ? (
          <section className="admin-panel" aria-label="알림">
            <div className="admin-panel-header">
              <div className="flex min-w-0 items-center gap-2">
                <Megaphone className="h-5 w-5 shrink-0 text-admin-accent" aria-hidden="true" />
                <h2 className="admin-section-title">알림</h2>
              </div>
            </div>
            {announcements.length ? (
              announcements.map((item) => (
                <article key={item.id} className="admin-panel-row block">
                  <p className="font-semibold text-admin-text break-keep">
                    {item.isPinned ? <span className="mr-2 text-admin-accent">고정</span> : null}
                    {item.title}
                    <span className="admin-help ml-2 font-normal">{formatDate(item.publishedAt ?? item.createdAt)}</span>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-keep text-admin-text-secondary">{item.content}</p>
                </article>
              ))
            ) : (
              <p className="admin-panel-row admin-help">새 공지가 없어요.</p>
            )}
          </section>
        ) : null}

        {flags.examManagement ? (
          <section className="admin-panel" aria-label="시험">
            <div className="admin-panel-header">
              <div className="flex min-w-0 items-center gap-2">
                <GraduationCap className="h-5 w-5 shrink-0 text-admin-accent" aria-hidden="true" />
                <h2 className="admin-section-title">시험</h2>
              </div>
              <Link className="admin-button admin-button-compact" href={`${base}/exams`} prefetch={false}>
                성적 보기
              </Link>
            </div>
            {flags.examScheduleManagement ? (
              <div className="admin-panel-row">
                <span className="admin-label w-24 shrink-0">다음 시험</span>
                <span className="min-w-0 break-keep">
                  {data.upcomingExamSchedule
                    ? `${data.upcomingExamSchedule.name} · ${data.upcomingExamSchedule.examDate} (${data.upcomingExamSchedule.dDayLabel})`
                    : "등록된 시험 일정이 없어요."}
                </span>
              </div>
            ) : null}
            <div className="admin-panel-row">
              <span className="admin-label w-24 shrink-0">최근 시험</span>
              <span className="min-w-0 break-keep">
                {data.latestExam
                  ? `${data.latestExam.examTypeName}${data.latestExam.examDate ? ` · ${data.latestExam.examDate}` : ""} · 총점 ${data.latestExam.totalScore ?? "—"}점`
                  : "아직 시험 기록이 없어요."}
              </span>
            </div>
          </section>
        ) : null}

        {flags.pointManagement ? (
          <section>
            <PortalSectionHeader
              title="최근 상벌점"
              icon={<ShieldAlert className="h-5 w-5" />}
              action={
                <Link className="admin-button admin-button-compact" href={`${base}/points`} prefetch={false}>
                  전체 보기
                </Link>
              }
            />
            {data.recentPoints.length ? (
              <div className="admin-table-frame mt-4">
                <table className="w-full" aria-label="최근 상벌점">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>점수</th>
                      <th className="admin-table-name">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentPoints.map((record) => (
                      <tr key={record.id}>
                        <td>{formatDate(record.date)}</td>
                        <td><PointValueBadge points={record.points} /></td>
                        <td className="admin-table-name">{record.ruleName || record.notes || "직접 기록"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-empty-state mt-4">아직 상벌점 기록이 없어요.</p>
            )}
          </section>
        ) : null}
      </StudentPortalFrame>
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
