import { redirect } from "next/navigation";

import { StudentLoginForm } from "@/components/student-view/StudentLoginForm";
import { getCurrentStudentSession } from "@/lib/auth";
import { getDivisionTheme } from "@/lib/services/settings.service";

type StudentLoginPageProps = {
  params: {
    division: string;
  };
};

export default async function StudentLoginPage({ params }: StudentLoginPageProps) {
  const currentSession = await getCurrentStudentSession(params.division);

  if (currentSession) {
    redirect(`/${params.division}/student`);
  }

  const division = await getDivisionTheme(params.division);

  return (
    <StudentLoginForm
      divisionSlug={params.division}
      divisionName={division.fullName}
      sampleLogin={null}
    />
  );
}
