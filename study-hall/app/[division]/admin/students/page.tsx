import dynamic from "next/dynamic";
import { Users } from "lucide-react";

import { requireDivisionAdminAccess } from "@/lib/auth";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listSeatOptions } from "@/lib/services/seat.service";
import { getDivisionGeneralSettings } from "@/lib/services/settings.service";
import { listStudents } from "@/lib/services/student.service";
import { listTuitionPlans } from "@/lib/services/tuition-plan.service";

const StudentListManager = dynamic(
  () => import("@/components/students/StudentListManager").then((mod) => mod.StudentListManager),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <article key={i} className="rounded-[10px] border border-slate-200 bg-white p-5">
              <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
              <div className="mt-4 h-8 w-14 animate-pulse rounded bg-slate-100" />
              <div className="mt-3 h-3 w-32 animate-pulse rounded bg-slate-100" />
            </article>
          ))}
        </section>
        <section className="flex items-center justify-center rounded-[10px] border border-slate-200 bg-white p-10">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <Users className="h-5 w-5 animate-pulse" />
            학생 명단을 불러오는 중입니다…
          </div>
        </section>
      </div>
    ),
  },
);

type StudentsPageProps = {
  params: {
    division: string;
  };
  searchParams?: Record<string, string | undefined>;
};

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function StudentsPage({ params, searchParams }: StudentsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "studentManagement");
  const session = await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  const [students, generalSettings, seatOptions, tuitionPlans] = await Promise.all([
    listStudents(params.division),
    getDivisionGeneralSettings(params.division),
    listSeatOptions(params.division, { activeOnly: true }),
    listTuitionPlans(params.division, { activeOnly: true }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
          학생 명단 관리
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          학생 검색, 상태 및 직렬 필터, 경고 단계 확인, 상세 페이지 이동까지 한 화면에서 처리합니다.
        </p>
      </section>

      <StudentListManager
        divisionSlug={params.division}
        initialStudents={students}
        canManage={session.role === "ADMIN" || session.role === "SUPER_ADMIN"}
        studyTrackOptions={generalSettings.studyTracks}
        seatOptions={seatOptions}
        tuitionPlans={tuitionPlans}
        initialCreateOpen={searchParams?.panel === "create"}
        today={getKstToday()}
        initialSearchParams={searchParams}
      />
    </div>
  );
}
