import { redirect } from "next/navigation";

import { requireDivisionStudentAccess } from "@/lib/auth";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type StudentPageProps = {
  params: {
    division: string;
  };
};

/**
 * 학생 포털에는 대시보드가 없다. 로그인 직후 도착하는 경로이므로 라우트는 남기고
 * 켜져 있는 첫 화면으로 넘긴다. 학습 랭킹은 기능 플래그가 없어 항상 열려 있다.
 */
export default async function StudentPage({ params }: StudentPageProps) {
  await requireDivisionStudentAccess(params.division);

  const settings = await getDivisionFeatureSettings(params.division);

  if (settings.featureFlags.attendanceManagement) {
    redirect(`/${params.division}/student/attendance`);
  }

  redirect(`/${params.division}/student/study-ranking`);
}
