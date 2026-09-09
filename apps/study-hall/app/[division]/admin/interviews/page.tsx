import { InterviewManager } from "@/components/interviews/InterviewManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listInterviews } from "@/lib/services/interview.service";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { listStudents } from "@/lib/services/student.service";

type AdminInterviewsPageProps = {
  params: {
    division: string;
  };
  // 경고 대상자 화면에서 "면담 기록"으로 넘어오면 폼을 미리 채운다.
  searchParams?: {
    studentId?: string;
    trigger?: string;
    reason?: string;
  };
};

function getCurrentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default async function AdminInterviewsPage({
  params,
  searchParams,
}: AdminInterviewsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "interviewManagement");
  const currentMonth = getCurrentMonth();

  const [students, interviews, followUps, settings] = await Promise.all([
    listStudents(params.division),
    listInterviews(params.division, { month: currentMonth }),
    listInterviews(params.division, { followUpDue: true }),
    getDivisionSettings(params.division),
  ]);

  const prefillStudentId = searchParams?.studentId;
  const prefill =
    prefillStudentId && students.some((student) => student.id === prefillStudentId)
      ? {
          studentId: prefillStudentId,
          trigger: searchParams?.trigger ?? "",
          reason: searchParams?.reason ?? "",
        }
      : null;

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">면담 기록</h1>
      </section>

      <InterviewManager
        divisionSlug={params.division}
        students={students}
        initialInterviews={interviews}
        initialFollowUps={followUps}
        warnInterview={students.some((s) => s.demeritPoints !== undefined) ? settings.warnLevel2 : settings.warnInterview}
        prefill={prefill}
      />
    </div>
  );
}
