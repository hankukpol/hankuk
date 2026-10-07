import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { InterviewJournalPrint } from "@/components/interviews/InterviewJournalPrint";
import { PrintPageButton } from "@/components/students/PrintPageButton";
import { requireDivisionAdminAccess } from "@/lib/auth";
import { getKstTodayYmd } from "@/lib/date-utils";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { isNotFoundError } from "@/lib/errors";
import { listInterviews } from "@/lib/services/interview.service";
import { getStudentDetail } from "@/lib/services/student.service";

export const dynamic = "force-dynamic";

type Props = { params: { division: string; id: string } };

/** 학생 면담 일지 인쇄. 화면에서는 A4 미리보기, 인쇄하면 A4 세로로 나뉜다. */
export default async function StudentInterviewJournalPage({ params }: Props) {
  await redirectIfDivisionFeatureDisabled(params.division, "interviewManagement");
  await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  let student;
  try {
    student = await getStudentDetail(params.division, params.id);
  } catch (error) {
    if (isNotFoundError(error)) notFound();
    throw error;
  }
  // 학생 조회가 division 으로 묶여 있고, 면담 조회도 같은 division·학생으로 거른다.
  const interviews = await listInterviews(params.division, { studentId: student.id });
  const journalHref = `/${params.division}/admin/interviews?student=${encodeURIComponent(student.id)}`;

  return (
    <div className="admin-flat-page">
      <div className="report-toolbar" data-print-hide>
        <div className="admin-workspace-toolbar">
          <div className="min-w-0">
            <Link href={journalHref} className="admin-text-action mb-3">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              면담 일지로
            </Link>
            <h1 className="admin-page-title">{student.name} 면담 일지</h1>
            <p className="admin-page-description">약속 확인 칸과 다음 면담 메모 빈칸이 함께 나옵니다. 인쇄하면 면담 표가 행 단위로만 쪽이 넘어갑니다.</p>
          </div>
          <PrintPageButton />
        </div>
      </div>
      <InterviewJournalPrint student={student} interviews={interviews} today={getKstTodayYmd()} />
    </div>
  );
}
