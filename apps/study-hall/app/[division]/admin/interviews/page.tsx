import { InterviewManager } from "@/components/interviews/InterviewManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listInterviews } from "@/lib/services/interview.service";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { listStudents } from "@/lib/services/student.service";

type AdminInterviewsPageProps = {
  params: {
    division: string;
  };
};

function getCurrentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default async function AdminInterviewsPage({ params }: AdminInterviewsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "interviewManagement");
  const currentMonth = getCurrentMonth();

  const [students, interviews, settings] = await Promise.all([
    listStudents(params.division),
    listInterviews(params.division, { month: currentMonth }),
    getDivisionSettings(params.division),
  ]);

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">면담 기록</h1>
      </section>

      <InterviewManager
        divisionSlug={params.division}
        students={students}
        initialInterviews={interviews}
        warnInterview={students.some((s) => s.demeritPoints !== undefined) ? settings.warnLevel2 : settings.warnInterview}
      />
    </div>
  );
}
