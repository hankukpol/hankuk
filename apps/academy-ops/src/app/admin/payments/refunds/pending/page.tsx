import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function toQueryString(searchParams?: SearchParams) {
  if (!searchParams) return "";

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
      continue;
    }
    if (value !== undefined) {
      query.set(key, value);
    }
  }

  const next = query.toString();
  return next ? `?${next}` : "";
}

export default async function PendingRefundAliasPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  redirect(`/admin/payments/refunds${toQueryString(resolvedSearchParams)}`);
}
