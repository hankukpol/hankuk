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
    /** 학생 상세 "면담 일지 열기" — 폼은 열지 않고 그 학생의 일지를 고른다. */
    student?: string;
  };
};

export default async function AdminInterviewsPage({
  params,
  searchParams,
}: AdminInterviewsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "interviewManagement");

  const [students, interviews, followUps, settings] = await Promise.all([
    listStudents(params.division),
    // 학생별 일지는 기간을 나누지 않는다. 한 학원의 면담은 학생당 몇 건 수준이라 전체를 한 번에 읽는다.
    listInterviews(params.division),
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
      <section className="max-md:sr-only">
        <h1 className="admin-page-title">면담 기록</h1>
      </section>

      <InterviewManager
        divisionSlug={params.division}
        students={students}
        initialInterviews={interviews}
        initialFollowUps={followUps}
        warnInterview={students.some((s) => s.demeritPoints !== undefined) ? settings.warnLevel2 : settings.warnInterview}
        prefill={prefill}
        initialStudentId={searchParams?.student}
      />
    </div>
  );
}
