import { redirect } from "next/navigation";

type Props = {
  params: { examNumber: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function StudentAnalysisPage({ params, searchParams }: Props) {
  const periodId = Array.isArray(searchParams?.periodId)
    ? searchParams.periodId[0]
    : searchParams?.periodId;
  const qs = periodId ? `&periodId=${periodId}` : "";
  redirect(`/admin/students/${params.examNumber}?tab=analysis${qs}`);
}
