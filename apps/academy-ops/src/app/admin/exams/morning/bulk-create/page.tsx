import Link from "next/link";
import { AdminRole, ExamType } from "@prisma/client";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { requireAdminContext } from "@/lib/auth";
import {
  buildExamSubjectLabelMap,
  buildExamSubjectOptions,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { listPeriods } from "@/lib/periods/service";
import { BulkCreateForm } from "./bulk-create-form";

export const dynamic = "force-dynamic";

export default async function BulkCreateSessionPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const scope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(scope);
  const periods = await listPeriods();
  const subjectCatalog =
    academyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(academyId, { includeInactive: true });
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  const periodOptions = periods.map((period) => ({
    id: period.id,
    name: period.name,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    isActive: period.isActive,
    isGongchaeEnabled: period.isGongchaeEnabled,
    isGyeongchaeEnabled: period.isGyeongchaeEnabled,
    totalWeeks: period.totalWeeks,
  }));

  const subjectOptionsByExamType = {
    [ExamType.GONGCHAE]: buildExamSubjectOptions(subjectCatalog, ExamType.GONGCHAE).map((item) => ({
      value: item.value,
      label: item.label,
    })),
    [ExamType.GYEONGCHAE]: buildExamSubjectOptions(subjectCatalog, ExamType.GYEONGCHAE).map((item) => ({
      value: item.value,
      label: item.label,
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "아침 모의고사", href: "/admin/exams/morning" },
          { label: "회차 일괄 생성" },
        ]}
      />

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            회차 일괄 생성
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">시험 회차 일괄 생성</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
            현재 지점의 시험 기간을 기준으로 날짜 범위와 요일별 과목을 설정해 회차를 한 번에 만듭니다. 이미
            존재하는 동일 회차는 자동으로 건너뜁니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/exams/morning"
            className="inline-flex items-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
          >
            수강 현황
          </Link>
          <Link
            href="/admin/exams/morning/sessions"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            회차 목록
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-[20px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-800">
        <strong>사용 방법:</strong> 시험 기간을 선택한 뒤 날짜 범위, 요일별 직렬과 과목, 시작 시간을 설정하고
        미리보기로 확인한 다음 <strong>회차 생성</strong>을 실행하세요. 중복 회차는 자동으로 건너뛰고 새 회차만
        생성합니다.
      </div>

      <div className="mt-8">
        {periodOptions.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-mist p-10 text-center">
            <p className="text-sm text-slate">등록된 시험 기간이 없습니다.</p>
            <Link
              href="/admin/periods"
              className="mt-4 inline-flex items-center rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
            >
              시험 기간 등록하기
            </Link>
          </div>
        ) : (
          <BulkCreateForm
            periods={periodOptions}
            subjectLabelMap={subjectLabelMap}
            subjectOptionsByExamType={subjectOptionsByExamType}
          />
        )}
      </div>
    </div>
  );
}
