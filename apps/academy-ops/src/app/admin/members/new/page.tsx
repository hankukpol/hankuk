import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { NewStudentForm } from "@/app/admin/students/new/new-student-form";

export const dynamic = "force-dynamic";

const TEXT = {
  members: "\uD68C\uC6D0 \uAD00\uB9AC",
  newMember: "\uC2E0\uADDC \uD68C\uC6D0 \uB4F1\uB85D",
  memberRegister: "\uD68C\uC6D0 \uB4F1\uB85D",
  description:
    "\uD68C\uC6D0 \uB9C8\uC2A4\uD130\uC758 \uC2E0\uADDC \uB4F1\uB85D\uC740 \uD559\uC0DD \uC2E0\uADDC \uB4F1\uB85D \uD3FC\uC744 \uADF8\uB300\uB85C \uC7AC\uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uD559\uBC88, \uC774\uB984, \uC5F0\uB77D\uCC98, \uC218\uAC15 \uC774\uB825 \uADDC\uCE59\uC744 \uC720\uC9C0\uD55C \uC587\uC740 \uC6B4\uC601 \uB798\uD37C\uC785\uB2C8\uB2E4.",
  studentNewPage: "\uD559\uC0DD \uC2E0\uADDC \uB4F1\uB85D \uD654\uBA74",
  toStudentList: "\uD559\uC0DD \uBAA9\uB85D\uC73C\uB85C \uC774\uB3D9",
  newRegister: "\uC2E0\uADDC \uB4F1\uB85D",
} as const;

export default async function AdminMemberNewPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/members" className="transition hover:text-ink">
          {TEXT.members}
        </Link>
        <span>/</span>
        <span className="text-ink">{TEXT.newRegister}</span>
      </nav>

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        {TEXT.memberRegister}
      </div>
      <h1 className="mt-5 text-3xl font-semibold">{TEXT.newMember}</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">{TEXT.description}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/students/new"
          className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember shadow-sm transition hover:bg-ember/20"
        >
          {TEXT.studentNewPage}
        </Link>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-ink/30 hover:text-ink"
        >
          {TEXT.toStudentList}
        </Link>
      </div>

      <div className="mt-8">
        <NewStudentForm />
      </div>
    </div>
  );
}