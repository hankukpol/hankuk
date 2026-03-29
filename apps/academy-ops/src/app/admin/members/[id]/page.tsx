import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import StudentHubPage from "@/app/admin/students/[examNumber]/page";
import { MemberProfilePanel } from "./member-profile-panel";

export const dynamic = "force-dynamic";

const TEXT = {
  members: "\uD68C\uC6D0 \uAD00\uB9AC",
  detail: "\uC0C1\uC138 \uC870\uD68C",
  memberDetail: "\uD68C\uC6D0 \uC0C1\uC138",
  memberDetailHub: "\uD68C\uC6D0 \uC0C1\uC138 \uD5C8\uBE0C",
  description:
    "\uC774 \uACBD\uB85C\uB294 \uAE30\uC874 \uD559\uC0DD \uC0C1\uC138 \uD5C8\uBE0C\uB97C \uC7AC\uC0AC\uC6A9\uD558\uBA74\uC11C \uD68C\uC6D0 \uB9C8\uC2A4\uD130 \uCD5C\uC18C \uD504\uB85C\uD544\uB9CC \uC0C1\uB2E8\uC5D0 \uC5B9\uB294 \uC587\uC740 \uC6B4\uC601 \uB798\uD37C\uC785\uB2C8\uB2E4. \uC2DD\uBCC4\uC790\uB294 \uD604\uC7AC \uD559\uBC88 \uAE30\uC900\uC73C\uB85C \uB9DE\uCDA5\uB2C8\uB2E4.",
  actualStudentPath: "\uC2E4\uC81C \uD559\uC0DD \uC0C1\uC138 \uACBD\uB85C",
  memberPayments: "\uD68C\uC6D0 \uC218\uB0A9 \uC774\uB825",
  membersHub: "\uD68C\uC6D0 \uAD00\uB9AC \uD5C8\uBE0C",
} as const;

type PageProps = {
  params: {
    id: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminMemberDetailPage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);

  return (
    <div>
      <div className="p-8 sm:p-10">
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
          <Link href="/admin/members" className="transition hover:text-ink">
            {TEXT.members}
          </Link>
          <span>/</span>
          <span className="text-ink">{TEXT.detail}</span>
        </nav>

        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          {TEXT.memberDetail}
        </div>
        <h1 className="mt-5 text-3xl font-semibold">{TEXT.memberDetailHub}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">{TEXT.description}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/admin/students/${params.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest shadow-sm transition hover:bg-forest/10"
          >
            {TEXT.actualStudentPath}
          </Link>
          <Link
            href={`/admin/members/${params.id}/payments`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember shadow-sm transition hover:bg-ember/20"
          >
            {TEXT.memberPayments}
          </Link>
          <Link
            href="/admin/members"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-ink/30 hover:text-ink"
          >
            {TEXT.membersHub}
          </Link>
        </div>
      </div>

      <div className="px-8 pb-8 sm:px-10">
        <MemberProfilePanel examNumber={params.id} />
      </div>

      <StudentHubPage params={{ examNumber: params.id }} searchParams={searchParams} />
    </div>
  );
}

