import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ month?: string; period?: string }>;
};

export default async function DiscountCodeReportAliasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const period = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : params.period && params.period.length > 0
      ? params.period
      : "current";

  redirect(`/admin/settings/discount-codes/analytics?period=${encodeURIComponent(period)}`);
}