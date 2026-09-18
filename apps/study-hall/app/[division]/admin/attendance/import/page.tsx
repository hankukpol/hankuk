import Link from "next/link";
import { CumulativeAttendanceImport } from "@/components/attendance/CumulativeAttendanceImport";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";

export default async function Page({ params }: { params: { division: string } }) {
  await redirectIfDivisionFeatureDisabled(params.division, "attendanceManagement");
  return <div className="admin-flat-page"><Link className="admin-text-action" href={`/${params.division}/admin/attendance`}>출석부로 돌아가기</Link><CumulativeAttendanceImport divisionSlug={params.division} /></div>;
}
