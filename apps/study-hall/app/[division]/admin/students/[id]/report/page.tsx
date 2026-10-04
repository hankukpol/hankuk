import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { PrintPageButton } from "@/components/students/PrintPageButton";
import { StudentCounselingReport } from "@/components/students/StudentCounselingReport";
import { requireDivisionAdminAccess } from "@/lib/auth";
import { getKstTodayYmd } from "@/lib/date-utils";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { isNotFoundError } from "@/lib/errors";
import { getStudentCounselingReport } from "@/lib/services/student-report.service";
import { reportRange } from "@/lib/student-report";

export const dynamic = "force-dynamic";

type Props = {
  params: { division: string; id: string };
  searchParams: Record<string, string | string[] | undefined>;
};

const QUICK = [
  { label: "최근 4주", days: 27 },
  { label: "최근 8주", days: 55 },
  { label: "최근 12주", days: 83 },
];

/** 면담용 학생 상담 자료. 화면에서는 A4 미리보기, 인쇄하면 A4 세로로 나뉜다. */
export default async function StudentReportPage({ params, searchParams }: Props) {
  await redirectIfDivisionFeatureDisabled(params.division, "studentManagement");
  await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  const today = getKstTodayYmd();
  const range = reportRange(today, searchParams.from, searchParams.to);
  let report;
  try {
    report = await getStudentCounselingReport(params.division, params.id, range);
  } catch (error) {
    if (isNotFoundError(error)) notFound();
    throw error;
  }
  const base = `/${params.division}/admin/students/${encodeURIComponent(params.id)}`;
  const shift = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

  return (
    <div className="admin-flat-page">
      <div className="report-toolbar" data-print-hide>
        <div className="admin-workspace-toolbar">
          <div className="min-w-0">
            <Link href={base} className="admin-text-action mb-3">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              학생 상세로
            </Link>
            <h1 className="admin-page-title">{report.student.name} 상담 자료</h1>
            <p className="admin-page-description">성적·출결·등원 시각·상벌점을 A4로 모았습니다. 인쇄하면 쪽마다 표가 잘리지 않게 나뉩니다.</p>
          </div>
          <PrintPageButton />
        </div>
        <form className="admin-filter-bar" method="get">
          <label className="admin-label">
            시작일
            <input type="date" name="from" defaultValue={range.from} />
          </label>
          <label className="admin-label">
            종료일
            <input type="date" name="to" defaultValue={range.to} max={today} />
          </label>
          <button type="submit" className="admin-button">기간 적용</button>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => {
              const from = shift(q.days);
              const active = range.from === from && range.to === today;
              return (
                <Link key={q.label} href={`${base}/report?from=${from}&to=${today}`} className="admin-choice-button admin-choice-button-auto" aria-pressed={active}>
                  {q.label}
                </Link>
              );
            })}
          </div>
        </form>
      </div>
      <StudentCounselingReport report={report} today={today} />
    </div>
  );
}
