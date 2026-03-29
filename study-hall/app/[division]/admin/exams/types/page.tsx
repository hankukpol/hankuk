import { redirect } from "next/navigation";

type AdminExamTypesRedirectPageProps = {
  params: {
    division: string;
  };
};

export default function AdminExamTypesRedirectPage({
  params,
}: AdminExamTypesRedirectPageProps) {
  redirect(`/${params.division}/admin/settings/exams`);
}
