import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TEXT = {
  members: "\uD68C\uC6D0 \uAD00\uB9AC",
  hub: "\uD68C\uC6D0 \uAD00\uB9AC \uD5C8\uBE0C",
  description:
    "\uD68C\uC6D0 \uACBD\uB85C\uB294 \uAE30\uC874 \uD559\uC0DD \uAD00\uB9AC \uD654\uBA74\uC744 \uC7AC\uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uBAA9\uB85D, \uC2E0\uADDC \uB4F1\uB85D, \uC0C1\uC138 \uC870\uD68C\uB85C \uBC14\uB85C \uC774\uB3D9\uD560 \uC218 \uC788\uB294 \uC6B4\uC601 \uC9C4\uC785\uC810\uC785\uB2C8\uB2E4.",
  studentList: "\uD559\uC0DD \uBAA9\uB85D",
  newMember: "\uC2E0\uADDC \uB4F1\uB85D",
  enrollment: "\uC218\uAC15 \uB4F1\uB85D",
  idRuleLabel: "\uC2DD\uBCC4 \uAE30\uC900",
  idRule: "\uD559\uBC88 \uC6B0\uC120",
  idRuleHint: "\uD559\uC0DD\uBA85 \uB610\uB294 \uD559\uBC88 \uD074\uB9AD \uC2DC \uC0C1\uC138 \uD654\uBA74\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.",
  basics: "\uAE30\uBCF8 \uC815\uBCF4",
  basicsHint: "\uBAA8\uB4E0 \uD68C\uC6D0 \uD654\uBA74\uC758 \uAE30\uC900 \uC2DD\uBCC4\uAC12\uACFC \uD45C\uC2DC \uC774\uB984\uC785\uB2C8\uB2E4.",
  contact: "\uC5F0\uB77D \uC815\uBCF4",
  contactHint: "\uD654\uBA74\uC5D0\uC11C\uB294 `phone`\uC774 \uC544\uB2C8\uB77C `mobile` \uC758\uBBF8\uB85C \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.",
  enrollments: "\uC218\uAC15 \uC774\uB825",
  enrollmentsHint: "\uD68C\uC6D0 \uD5C8\uBE0C\uB294 \uAE30\uC874 \uC218\uAC15\uC0DD \uC218\uAC15 \uC774\uB825\uC744 \uADF8\uB300\uB85C \uC7AC\uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
  operations: "\uC6B4\uC601 \uC6D0\uCE59",
  operationsHint:
    "\uC774 \uACBD\uB85C\uB294 \uBCC4\uB3C4 \uC2A4\uD0A4\uB9C8\uB97C \uB9CC\uB4E4\uC9C0 \uC54A\uACE0 \uD559\uC0DD \uAD00\uB9AC \uD654\uBA74\uC744 \uAC10\uC2FC \uC587\uC740 \uC6B4\uC601 \uC9C4\uC785\uC810\uC785\uB2C8\uB2E4. \uC0C1\uC138 \uC870\uD68C\uB294 `/admin/students/[examNumber]`\uB97C \uADF8\uB300\uB85C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
} as const;

export default async function AdminMembersPage() {
  await requireAdminContext(AdminRole.TEACHER);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        {TEXT.members}
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{TEXT.hub}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">{TEXT.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/students"
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest shadow-sm transition hover:bg-forest/10"
          >
            {TEXT.studentList}
          </Link>
          <Link
            href="/admin/students/new"
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember shadow-sm transition hover:bg-ember/20"
          >
            {TEXT.newMember}
          </Link>
          <Link
            href="/admin/enrollments"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-ink/30 hover:text-ink"
          >
            {TEXT.enrollment}
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">{TEXT.idRuleLabel}</p>
          <p className="mt-2 text-lg font-semibold text-ink">{TEXT.idRule}</p>
          <p className="mt-1 text-sm leading-6 text-slate">{TEXT.idRuleHint}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">{TEXT.basics}</p>
          <p className="mt-2 text-lg font-semibold text-ink">examNumber / name</p>
          <p className="mt-1 text-sm leading-6 text-slate">{TEXT.basicsHint}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">{TEXT.contact}</p>
          <p className="mt-2 text-lg font-semibold text-ink">mobile</p>
          <p className="mt-1 text-sm leading-6 text-slate">{TEXT.contactHint}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">{TEXT.enrollments}</p>
          <p className="mt-2 text-lg font-semibold text-ink">enrollments[]</p>
          <p className="mt-1 text-sm leading-6 text-slate">{TEXT.enrollmentsHint}</p>
        </div>
      </div>

      <div className="mt-8 rounded-[28px] border border-forest/15 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-ink">{TEXT.operations}</p>
        <p className="mt-2 text-sm leading-7 text-slate">{TEXT.operationsHint}</p>
      </div>
    </div>
  );
}