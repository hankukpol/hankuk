import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { TextbookManager } from "@/components/textbooks/textbook-manager";

export const dynamic = "force-dynamic";

export default async function TextbooksSettingsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const textbooks = await getPrisma().textbook.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            P0-5 교재 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold">교재 관리</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            교재를 등록하고 재고를 관리합니다. 판매 내역은 별도 메뉴에서 확인할 수 있습니다.
          </p>
        </div>
        <Link
          href="/admin/textbooks"
          className="mt-1 flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember/90"
        >
          판매 현황 보기 →
        </Link>
      </div>
      <div className="mt-8">
        <TextbookManager initialTextbooks={textbooks as any} />
      </div>
    </div>
  );
}
