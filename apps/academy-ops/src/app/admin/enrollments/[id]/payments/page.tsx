import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
};

function toQueryString(
  enrollmentId: string,
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const qs = new URLSearchParams();

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) qs.append(key, item);
        continue;
      }
      qs.set(key, value);
    }
  }

  qs.set("enrollmentId", enrollmentId);
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export default async function EnrollmentPaymentsAliasPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  redirect(`/admin/payments/new${toQueryString(id, searchParams)}`);
}
