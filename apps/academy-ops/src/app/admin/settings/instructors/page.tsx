import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InstructorManager } from "./instructor-manager";

export const dynamic = "force-dynamic";

export type InstructorRow = {
  id: string;
  name: string;
  subject: string;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  isActive: boolean;
  createdAt: string;
};

export default async function InstructorsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const instructors = await getPrisma().instructor.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const rows: InstructorRow[] = instructors.map((i) => ({
    ...i,
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">강사 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        강사 정보와 정산 계좌를 관리합니다. 강사 정산율은 강좌 배정 시 별도로 설정합니다.
      </p>
      <div className="mt-8">
        <InstructorManager initialInstructors={rows} />
      </div>
    </div>
  );
}
