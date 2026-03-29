import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { MonthlySettlementView } from "@/components/settlements/monthly-settlement-view";
import { getMonthlySettlementData } from "@/lib/settlements/monthly";

export const dynamic = "force-dynamic";

const UI_TEXT = {
  badge: "\uc6d4 \uacb0\uc0b0",
  title: "\uc6d4\uacc4\ud45c",
  description:
    "\uc6d4\ubcc4 \uc218\ub0a9 \ud604\ud669\uacfc \uc77c\uc790\ubcc4 \uc785\uae08, \ud658\ubd88 \ub0b4\uc5ed\uc744 \ud655\uc778\ud569\ub2c8\ub2e4.",
  settlementLink: "\uc815\uc0b0 \ub300\uc870\ud45c",
  paymentLink: "\uc218\ub0a9 \ub300\uc870\ud45c",
  reportLink: "\uc0c1\uc138 \ubd84\uc11d \ubcf4\uace0\uc11c",
} as const;

export default async function MonthlySettlementPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const initialData = await getMonthlySettlementData(searchParams.month);
  const monthStr = initialData.month;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        {UI_TEXT.badge}
      </div>
      <h1 className="mt-5 text-3xl font-semibold">{UI_TEXT.title}</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        {UI_TEXT.description}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          prefetch={false}
          href={`/admin/settlements/reconciliation?month=${monthStr}`}
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-5 py-2.5 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/20"
        >
          {UI_TEXT.settlementLink}
        </Link>
        <Link
          prefetch={false}
          href={`/admin/payments/reconciliation?month=${monthStr}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
        >
          {UI_TEXT.paymentLink}
        </Link>
        <Link
          prefetch={false}
          href={`/admin/reports/monthly/details?month=${monthStr}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-mist"
        >
          {UI_TEXT.reportLink}
        </Link>
      </div>
      <div className="mt-8">
        <MonthlySettlementView initialData={initialData} />
      </div>
    </div>
  );
}
