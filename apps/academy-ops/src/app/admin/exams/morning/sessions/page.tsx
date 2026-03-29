import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MorningSessionsAliasPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const examNumber = readFirst(params.examNumber)?.trim();

  if (examNumber) {
    redirect(`/admin/students/${examNumber}/score-trend`);
  }

  const nextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "examNumber") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) nextParams.append(key, item);
      }
      continue;
    }
    if (value) nextParams.set(key, value);
  }

  const query = nextParams.toString();
  redirect(query ? `/admin/scores/sessions?${query}` : "/admin/scores/sessions");
}
