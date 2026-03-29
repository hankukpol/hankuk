import Link from "next/link";
import { AbsenceStatus, AdminRole, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { BulkManagerClient, type BulkManagerNote } from "./bulk-manager-client";

export const dynamic = "force-dynamic";

export default async function AbsenceNoteBulkManagerPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const prisma = getPrisma();

  const rawNotes = await prisma.absenceNote.findMany({
    where: {
      status: AbsenceStatus.PENDING,
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
        },
      },
      session: {
        select: {
          examDate: true,
          week: true,
          subject: true,
        },
      },
    },
    orderBy: [{ submittedAt: "asc" }, { examNumber: "asc" }],
  });

  const notes: BulkManagerNote[] = rawNotes.map((note) => ({
    id: note.id,
    examNumber: note.examNumber,
    status: note.status,
    reason: note.reason,
    absenceCategory: note.absenceCategory,
    submittedAt: note.submittedAt ? note.submittedAt.toISOString() : null,
    student: {
      name: note.student.name,
      phone: note.student.phone,
    },
    session: {
      examDate: note.session.examDate.toISOString(),
      week: note.session.week,
      subject: note.session.subject as Subject,
    },
  }));

  const pendingCount = notes.length;

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        사유서 관리 &rsaquo; 일괄 처리
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">사유서 일괄 승인/반려</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            현재 대기 중인 사유서를 한 번에 여러 건 승인하거나 반려할 수 있습니다.
            체크박스로 선택 후 하단 액션 바에서 처리하세요.
          </p>
        </div>
        <Link
          href="/admin/absence-notes"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 사유서 관리로
        </Link>
      </div>

      {/* Summary card */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <article className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-5">
          <p className="text-sm text-slate">검토 대기</p>
          <p className="mt-3 text-3xl font-semibold text-amber-700">
            {pendingCount}
            <span className="ml-1 text-base font-normal text-amber-600">건</span>
          </p>
          <p className="mt-2 text-xs leading-6 text-slate">
            승인 또는 반려 처리가 필요한 사유서
          </p>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-mist/70 p-5">
          <p className="text-sm text-slate">처리 방법</p>
          <p className="mt-3 text-base font-semibold text-ink leading-6">
            체크박스 선택 후<br />일괄 처리 버튼 클릭
          </p>
          <p className="mt-2 text-xs leading-6 text-slate">
            하단 고정 액션 바에서 일괄 승인/반려
          </p>
        </article>
        <article className="rounded-[24px] border border-sky-100 bg-sky-50/60 p-5">
          <p className="text-sm text-slate">개별 처리</p>
          <p className="mt-3 text-base font-semibold text-ink leading-6">
            상세 열기 버튼으로<br />건별 검토 가능
          </p>
          <p className="mt-2 text-xs leading-6 text-slate">
            각 행의 상세 버튼 클릭 시 새 탭에서 열림
          </p>
        </article>
      </div>

      {/* Client component with the interactive table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">대기 사유서 목록</h2>
            <p className="mt-1 text-sm text-slate">
              제출 순서대로 정렬되어 있습니다. 처리 후 목록이 자동 갱신됩니다.
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
              {pendingCount}건 대기
            </span>
          )}
        </div>

        <BulkManagerClient notes={notes} />
      </div>
    </div>
  );
}
