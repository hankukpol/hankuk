import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { AttendanceParse } from "./attendance-parse";

export const dynamic = "force-dynamic";

export default async function AttendanceParsePage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const classroom = await getPrisma().classroom.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, generation: true },
  });

  if (!classroom) notFound();

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-center gap-2 mb-2">
        <Link
          href={`/admin/classrooms/${params.id}`}
          className="text-sm text-slate hover:text-ink"
        >
          ← {classroom.name}
        </Link>
      </div>
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        카카오 출석 파싱
      </div>
      <h1 className="mt-5 text-3xl font-semibold">출석 파싱</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        카카오톡 단체 채팅방에서 내보낸 텍스트를 붙여넣어 출석을 자동으로 파싱합니다.
        "52기 윤정원 / 동원했습니다 / 오전 5:51" 형식을 인식합니다.
      </p>

      {/* Link to the newer client-side dedicated parse page */}
      <div className="mt-4">
        <Link
          href={`/admin/classrooms/${params.id}/attendance/parse`}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
        >
          카카오 출결 전용 파서 (신규) →
        </Link>
      </div>

      <div className="mt-8">
        <AttendanceParse classroomId={classroom.id} classroomName={classroom.name} />
      </div>
    </div>
  );
}
