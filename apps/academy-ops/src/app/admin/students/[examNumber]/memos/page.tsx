import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { MemoThreadClient, type MemoRow } from "./memo-thread-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

export default async function StudentMemoThreadPage({ params }: PageProps) {
  const { examNumber } = await params;

  const context = await requireAdminContext(AdminRole.COUNSELOR);

  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      examType: true,
      isActive: true,
    },
  });

  if (!student) notFound();

  const viewerId = context.adminUser.id;

  const rawMemos = await getPrisma().adminMemo.findMany({
    where: {
      relatedStudentExamNumber: examNumber,
      OR: [
        { scope: "TEAM" },
        { ownerId: viewerId },
        { assigneeId: viewerId },
      ],
    },
    include: {
      owner: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });

  const memos: MemoRow[] = rawMemos.map((m) => ({
    id: m.id,
    title: m.title,
    content: m.content,
    color: m.color,
    scope: m.scope,
    status: m.status,
    isPinned: m.isPinned,
    dueAt: m.dueAt ? m.dueAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    owner: m.owner,
    assignee: m.assignee,
  }));

  const openCount = memos.filter((m) => m.status !== "DONE").length;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "학사 관리", href: "/admin/students" },
          { label: "전체 명단", href: "/admin/students" },
          { label: `${student.name} (${student.examNumber})`, href: `/admin/students/${student.examNumber}` },
          { label: "메모 스레드" },
        ]}
      />

      {/* 헤더 */}
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Link
            href={`/admin/students/${examNumber}`}
            className="text-sm text-slate transition hover:text-ember"
          >
            ← 학생 상세로
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-ink">
            {student.name}
            <span className="ml-3 text-xl font-normal text-slate">{student.examNumber}</span>
          </h1>
          {student.phone && (
            <p className="mt-1 text-sm text-slate">{student.phone}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate">
              메모 스레드
            </span>
            {openCount > 0 && (
              <span className="inline-flex rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember">
                진행 중 {openCount}건
              </span>
            )}
            {!student.isActive && (
              <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                비활성
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/students/${examNumber}?tab=memos`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
          >
            학생 탭에서 보기
          </Link>
        </div>
      </div>

      {/* 구분선 */}
      <div className="mt-6 border-b border-ink/10" />

      {/* 메모 목록 + 작성 폼 */}
      <div className="mt-6">
        <MemoThreadClient
          examNumber={examNumber}
          initialMemos={memos}
          currentAdminId={context.adminUser.id}
        />
      </div>
    </div>
  );
}
