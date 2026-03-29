import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
};

function toQueryString(searchParams?: Record<string, string | string[] | undefined>) {
  if (!searchParams) return "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) qs.append(key, item);
      continue;
    }
    qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export default async function CohortMembersAliasPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  redirect(`/admin/cohorts/${id}${toQueryString(searchParams)}`);
}
