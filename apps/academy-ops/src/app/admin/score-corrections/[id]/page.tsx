import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AdminMemoStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { ResolveButton } from "./resolve-button";
import {
  resolveScoreCorrectionTarget,
} from "@/lib/scores/correction-links";
import { resolveVisibleScoreSessionAcademyId } from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

const STATUS_LABEL: Record<AdminMemoStatus, string> = {
  OPEN: "처리 대기",
  IN_PROGRESS: "처리 중",
  DONE: "처리 완료",
};

const STATUS_COLOR: Record<AdminMemoStatus, string> = {
  OPEN: "bg-amber-50 border-amber-200 text-amber-700",
  IN_PROGRESS: "bg-blue-50 border-blue-200 text-blue-700",
  DONE: "bg-emerald-50 border-emerald-200 text-emerald-700",
};

export default async function ScoreCorrectionDetailPage({ params }: Props) {
  await requireAdminContext(AdminRole.TEACHER);
  const academyId = await resolveVisibleScoreSessionAcademyId();

  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const prisma = getPrisma();

  const memo = await prisma.adminMemo.findFirst({
    where: {
      id,
      content: { contains: "[성적 오류 신고]" },
    },
    include: {
      owner: { select: { id: true, name: true } },
    },
  });

  if (!memo) notFound();

  const scoreTarget = await resolveScoreCorrectionTarget({
    memo,
    academyId,
  });

  // Fetch student info if linked
  const student = memo.relatedStudentExamNumber
    ? await prisma.student.findUnique({
        where: { examNumber: memo.relatedStudentExamNumber },
        select: { examNumber: true, name: true, phone: true },
      })
    : null;

  const isDone = memo.status === AdminMemoStatus.DONE;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리", href: "/admin/scores/edit" },
          { label: "회차별 성적 오류 신고 목록", href: "/admin/score-corrections" },
          { label: "회차 신고 상세" },
        ]}
      />

      <div className="mt-4">
        <h1 className="text-3xl font-semibold">회차별 성적 오류 신고 상세</h1>
        <p className="mt-2 text-sm text-slate">학생이 신고한 회차별 성적 오류 건의 상세 내용을 확인하고 처리할 수 있습니다.</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Left: Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Content card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-lg font-semibold mb-4">신고 내용</h2>

            <div className="mb-4">
              <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-1">제목</p>
              <p className="text-sm font-medium">{memo.title}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-1">상세 내용</p>
              <div className="rounded-lg bg-mist/60 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed">
                {memo.content ?? "(내용 없음)"}
              </div>
            </div>
          </div>

          {/* Action card — only when not done */}
          {!isDone && (
            <div className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h2 className="text-lg font-semibold mb-4">처리</h2>
              <p className="mb-4 text-sm text-slate">
                성적 수정이 완료된 경우 &quot;처리 완료&quot;를, 신고 내용이 유효하지 않은 경우 &quot;반려&quot;를 선택하세요.
              </p>
              <ResolveButton memoId={String(memo.id)} />
              <div className="mt-4">
                <Link
                  href={scoreTarget.href}
                  className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
                >
                  해당 회차 성적 수정으로 열기
                </Link>
              </div>
            </div>
          )}

          {isDone && (
            <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-6">
              <p className="text-sm font-medium text-emerald-700">이 신고는 처리 완료 상태입니다.</p>
            </div>
          )}
        </div>

        {/* Right: Metadata */}
        <div className="space-y-4">
          {/* Status */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate mb-3">처리 상태</h3>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLOR[memo.status]}`}
            >
              {STATUS_LABEL[memo.status]}
            </span>
          </div>

          {/* Student info */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate mb-3">신고 학생</h3>
            {student ? (
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-xs text-slate">학번</p>
                  <Link
                    href={`/admin/students/${student.examNumber}`}
                    className="font-semibold text-ember underline-offset-2 hover:underline"
                  >
                    {student.examNumber}
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-slate">이름</p>
                  <Link
                    href={`/admin/students/${student.examNumber}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {student.name}
                  </Link>
                </div>
                {student.phone && (
                  <div>
                    <p className="text-xs text-slate">연락처</p>
                    <p className="font-medium">{student.phone}</p>
                  </div>
                )}
              </div>
            ) : memo.relatedStudentExamNumber ? (
              <p className="text-sm text-slate">학번: {memo.relatedStudentExamNumber} (정보 없음)</p>
            ) : (
              <p className="text-sm text-slate">학생 정보 없음</p>
            )}
          </div>

          {/* Dates */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate mb-3">일시</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-slate">신고 일시</p>
                <p className="font-medium">{formatDateTime(memo.createdAt)}</p>
              </div>
              {memo.updatedAt.getTime() !== memo.createdAt.getTime() && (
                <div>
                  <p className="text-xs text-slate">마지막 수정</p>
                  <p className="font-medium">{formatDateTime(memo.updatedAt)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Assigned admin */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate mb-3">접수 담당자</h3>
            <p className="text-sm font-medium">{memo.owner.name ?? "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
