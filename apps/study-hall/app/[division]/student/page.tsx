import { notFound } from "next/navigation";

import { StudentDashboard } from "@/components/student-view/StudentDashboard";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { getStudentDashboardData } from "@/lib/services/student-dashboard.service";

type StudentPageProps = {
  params: {
    division: string;
  };
};

export default async function StudentPage({ params }: StudentPageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const dashboard = await getStudentDashboardData(params.division, session.studentId);

    return <StudentDashboard data={dashboard} />;
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
