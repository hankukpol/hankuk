import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";

const sections = [
  {
    href: "/admin/facilities/lockers",
    title: "\uC0AC\uBB3C\uD568 \uAD00\uB9AC",
    description:
      "\uBC30\uC815, \uBC18\uB0A9, \uC774\uC6A9 \uD604\uD669\uACFC \uC6D4\uBCC4 \uC0AC\uC6A9\uB8CC\uB97C \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
    minRole: AdminRole.ACADEMIC_ADMIN,
  },
  {
    href: "/admin/facilities/study-rooms",
    title: "\uC2A4\uD130\uB514\uB8F8 \uAD00\uB9AC",
    description:
      "\uC608\uC57D \uD604\uD669, \uC8FC\uAC04 \uCEA8\uB9B0\uB354, \uD559\uC0DD \uC774\uC6A9 \uB0B4\uC5ED\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
    minRole: AdminRole.TEACHER,
  },
  {
    href: "/admin/facilities/textbooks",
    title: "\uAD50\uC7AC \uD310\uB9E4 \uAD00\uB9AC",
    description:
      "\uAD50\uC7AC \uC7AC\uACE0, \uD310\uB9E4 \uB0B4\uC5ED, \uC77C\uC77C \uD310\uB9E4 \uD750\uB984\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
    minRole: AdminRole.ACADEMIC_ADMIN,
  },
] as const;

export const dynamic = "force-dynamic";

export default async function FacilitiesHubPage() {
  const context = await requireAdminContext(AdminRole.TEACHER);
  const visibleSections = sections.filter((section) =>
    roleAtLeast(context.adminUser.role, section.minRole),
  );

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        {"\uC2DC\uC124 \uAD00\uB9AC"}
      </div>
      <div className="mt-5 max-w-3xl">
        <h1 className="text-3xl font-semibold text-ink">
          {"\uC2DC\uC124 \uAD00\uB9AC \uD5C8\uBE0C"}
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate sm:text-base">
          {
            "\uB9C8\uC2A4\uD130\uD50C\uB79C \uAE30\uC900 \uC2DC\uC124 \uAD00\uB9AC \uACBD\uB85C\uB97C \uAE30\uC874 \uC6B4\uC601 \uD654\uBA74\uC5D0 \uB9DE\uCDB0 \uBB36\uC5C8\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uAD8C\uD55C\uC73C\uB85C \uC811\uADFC\uD560 \uC218 \uC788\uB294 \uAE30\uB2A5\uB9CC \uD45C\uC2DC\uD569\uB2C8\uB2E4."
          }
        </p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {visibleSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Module 4</p>
            <h2 className="mt-3 text-xl font-semibold text-ink">{section.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate">{section.description}</p>
            <span className="mt-6 inline-flex items-center text-sm font-semibold text-sky-800">
              {"\uBC14\uB85C\uAC00\uAE30 ->"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
