import dynamic from "next/dynamic";

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
        <section className="admin-dashboard-metrics">
          {Array.from({ length: 4 }).map((_, i) => (
            <article key={i} className="admin-dashboard-metric" aria-hidden="true">
              <div className="admin-skeleton h-4 w-20" />
              <div className="admin-skeleton mt-4 h-8 w-14" />
              <div className="admin-skeleton mt-3 h-3 w-32" />
            </article>
          ))}
        </section>
        <p role="status" className="admin-empty-state">학생 명단을 불러오는 중입니다…</p>
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
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">
          학생 명단 관리
        </h1>
        <p className="admin-page-description">
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
