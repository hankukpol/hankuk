import { redirect } from "next/navigation";

import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";

type NewStudentPageProps = {
  params: {
    division: string;
  };
};

export default async function NewStudentPage({ params }: NewStudentPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "studentManagement");
  redirect(`/${params.division}/admin/students?panel=create`);
}
