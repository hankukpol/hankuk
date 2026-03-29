import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function MorningSessionAliasPage({ params }: PageProps) {
  const { sessionId } = await params;
  redirect(`/admin/exams/morning/sessions/${sessionId}`);
}
