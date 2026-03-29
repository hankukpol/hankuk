import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getActiveWeeklyReportSurfaceState } from "@/lib/export/weekly-report-archive";
import { WeeklyReportGeneratePanel } from "@/components/export/weekly-report-archive-panel";

export const dynamic = "force-dynamic";

export default async function WeeklyReportPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const surface = await getActiveWeeklyReportSurfaceState();

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/reports"
          className="text-sm text-slate hover:text-ink transition-colors"
        >
          보고서
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-sm text-ink font-medium">주간 성적 보고서</span>
      </div>

      <div className="mt-5 inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        보고서
      </div>
      <h1 className="mt-4 text-3xl font-semibold">주간 성적 보고서</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        현재 활성 기간의 최신 주차 성적·출결 현황을 Excel(.xlsx) 파일로 다운로드합니다.
        직렬(공채·경채)별로 완료된 회차가 자동으로 포함됩니다.
      </p>

      <div className="mt-8">
        <WeeklyReportGeneratePanel surface={surface} />
      </div>

      {/* 안내 섹션 */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">보고서 구성 안내</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest"></span>
            <span>직렬별 요약 시트 — 학생 수, 모의 평균, 출석률, 위험군 수 및 전주 대비 변화</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ember"></span>
            <span>위험군 목록 시트 — 경고·탈락 학생의 주간·월간 결시 횟수 및 연락처</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink/40"></span>
            <span>주간 성적표 시트 — 회차별 모의고사·경찰학 OX 점수, 석차, 출석률</span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-slate">
          보고서는 활성 기간 기준으로 생성됩니다. 기간 설정은{" "}
          <Link href="/admin/periods" className="text-ember underline hover:text-ember/80">
            기간 설정
          </Link>{" "}
          페이지에서 확인하세요.
        </p>
      </div>
    </div>
  );
}
