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
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">면담 기록</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          학생별 면담 내용을 기록하고, 벌점 기준을 넘은 학생에게는 즉시 면담 권장 안내를 표시합니다.
        </p>
      </section>

      <InterviewManager
        divisionSlug={params.division}
        students={students}
        initialInterviews={interviews}
        warnInterview={settings.warnInterview}
      />
    </div>
  );
}
