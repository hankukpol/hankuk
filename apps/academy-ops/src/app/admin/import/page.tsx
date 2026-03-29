import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function toQueryString(searchParams?: SearchParams) {
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

export default async function ImportAliasPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  redirect(`/admin/import-hub${toQueryString(searchParams)}`);
}