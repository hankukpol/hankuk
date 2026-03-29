import { redirect } from "next/navigation";

type Props = { params: { examNumber: string } };

export default function StudentHistoryPage({ params }: Props) {
  redirect(`/admin/students/${params.examNumber}?tab=history`);
}
