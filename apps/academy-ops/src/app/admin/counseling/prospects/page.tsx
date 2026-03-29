import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ProspectManager } from "./prospect-manager";

export const dynamic = "force-dynamic";

export default async function ProspectsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prospects = await getPrisma().consultationProspect.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      staff: { select: { name: true } },
    },
  });

  const serialized = prospects.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    examType: p.examType,
    source: p.source,
    stage: p.stage,
    note: p.note,
    staffId: p.staffId,
    enrollmentId: p.enrollmentId,
    visitedAt: p.visitedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    staff: p.staff,
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        상담 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">상담 방문자 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        문의·내방 상담 예비 원생의 유입 경로와 단계를 추적합니다. 등록 완료 후 수강 연결은 수강 등록 메뉴에서 처리하세요.
      </p>

      <div className="mt-8">
        <ProspectManager initialProspects={serialized} />
      </div>
    </div>
  );
}
