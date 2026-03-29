import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function DiscountAnalyticsAliasPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const month = readParam(params, "month");
  const period = month && /^\d{4}-\d{2}$/.test(month) ? month : "current";
  redirect(`/admin/settings/discount-codes/analytics?period=${encodeURIComponent(period)}`);
}