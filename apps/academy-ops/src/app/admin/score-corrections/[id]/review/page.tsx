import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AdminMemoStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDateTime, formatDate } from "@/lib/format";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { ReviewForm } from "./review-form";
import {
  resolveScoreCorrectionTarget,
} from "@/lib/scores/correction-links";
import { resolveVisibleScoreSessionAcademyId } from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

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

export default async function ScoreCorrectionReviewPage({ params }: Props) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);
  const academyId = await resolveVisibleScoreSessionAcademyId();

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (isNaN(id)) notFound();

  const prisma = getPrisma();

  const memo = await prisma.adminMemo.findFirst({
    where: {
      id,
      content: { contains: "[성적 오류 신고]" },
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  if (!memo) notFound();

  const scoreTarget = await resolveScoreCorrectionTarget({
    memo,
    academyId,
  });

  // Fetch related student
  const student = memo.relatedStudentExamNumber
    ? await prisma.student.findUnique({
        where: { examNumber: memo.relatedStudentExamNumber },
        select: { examNumber: true, name: true, phone: true },
      })
    : null;

  // Fetch history: other score correction memos for the same student
  const history =
    memo.relatedStudentExamNumber
      ? await prisma.adminMemo.findMany({
          where: {
            id: { not: id },
            relatedStudentExamNumber: memo.relatedStudentExamNumber,
            content: { contains: "[성적 오류" },
          },
          include: {
            owner: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : [];

  const isDone = memo.status === AdminMemoStatus.DONE;

  // Try to parse original/requested score from content
  // Format: [성적 오류 신고]\n기존 점수: XX\n요청 점수: XX\n...
  const lines = (memo.content ?? "").split("\n");
  const originalScoreLine = lines.find((l) => l.includes("기존 점수") || l.includes("현재 점수"));
  const requestedScoreLine = lines.find((l) => l.includes("요청 점수") || l.includes("수정 요청"));
  const reasonLine = lines.find((l) => l.includes("사유") || l.includes("이유"));

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리", href: "/admin/scores/edit" },
          { label: "회차별 성적 오류 신고 목록", href: "/admin/score-corrections" },
          { label: "회차 신고 상세", href: `/admin/score-corrections/${id}` },
          { label: "회차 승인 검토" },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            성적 오류 검토
          </div>
          <h1 className="mt-3 text-3xl font-semibold">회차별 성적 수정 신고 검토</h1>
          <p className="mt-2 text-sm text-slate">
            ACADEMIC_ADMIN 이상 권한으로 회차별 신고 내용을 검토하고 승인 또는 반려합니다.
          </p>
        </div>
        <Link
          href={`/admin/score-corrections/${id}`}
          className="mt-2 inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          기본 상세로
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* ── 왼쪽: 신고 내용 + 검토 폼 ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* 신고 내용 카드 */}
          <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
            <h2 className="text-lg font-semibold mb-5">신고 내용</h2>

            {/* 제목 */}
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate mb-1">제목</p>
              <p className="text-sm font-medium">{memo.title}</p>
            </div>

            {/* 파싱된 핵심 정보 */}
            {(originalScoreLine || requestedScoreLine) && (
              <div className="mb-4 grid gap-3 sm:grid-cols-3 rounded-2xl bg-mist/60 p-4">
                {originalScoreLine && (
                  <div>
                    <p className="text-xs font-semibold text-slate mb-1">기존 점수</p>
                    <p className="text-sm font-medium text-ink">{originalScoreLine.split(":").slice(1).join(":").trim()}</p>
                  </div>
                )}
                {requestedScoreLine && (
                  <div>
                    <p className="text-xs font-semibold text-slate mb-1">요청 점수</p>
                    <p className="text-sm font-semibold text-ember">{requestedScoreLine.split(":").slice(1).join(":").trim()}</p>
                  </div>
                )}
                {reasonLine && (
                  <div>
                    <p className="text-xs font-semibold text-slate mb-1">신고 사유</p>
                    <p className="text-sm text-ink">{reasonLine.split(":").slice(1).join(":").trim()}</p>
                  </div>
                )}
              </div>
            )}

            {/* 전체 내용 */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate mb-1">전체 내용</p>
              <div className="rounded-lg bg-mist/60 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed text-ink">
                {memo.content ?? "(내용 없음)"}
              </div>
            </div>

            <div className="mt-4">
              <Link
                href={scoreTarget.href}
                className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
              >
                해당 회차 성적 수정으로 열기 →
              </Link>
            </div>
          </section>

          {/* 승인 / 반려 폼 */}
          {isDone ? (
            <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-lg">
                  ✓
                </span>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">이미 처리 완료된 신고입니다.</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    처리 완료 상태로 추가 검토 액션을 취할 수 없습니다.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
              <h2 className="text-lg font-semibold mb-2">검토 결정</h2>
              <p className="text-sm text-slate mb-5">
                신고 내용을 검토한 후 해당 회차 기준으로 승인(수정 완료) 또는 반려를 선택하세요.
                반려 시 사유를 반드시 입력해 주세요.
              </p>
              <ReviewForm memoId={String(id)} />
            </section>
          )}
        </div>

        {/* ── 오른쪽: 메타 정보 + 이력 ───────────────────────────────── */}
        <div className="space-y-4">

          {/* 처리 상태 */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate mb-3">처리 상태</h3>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLOR[memo.status]}`}
            >
              {STATUS_LABEL[memo.status]}
            </span>
          </div>

          {/* 신고 학생 */}
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
              <p className="text-sm text-slate">학번: {memo.relatedStudentExamNumber}</p>
            ) : (
              <p className="text-sm text-slate">학생 정보 없음</p>
            )}
          </div>

          {/* 접수 정보 */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate mb-3">접수 정보</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-slate">신고 일시</p>
                <p className="font-medium">{formatDateTime(memo.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate">접수 담당자</p>
                <p className="font-medium">{memo.owner.name ?? "-"}</p>
              </div>
              {memo.assignee && (
                <div>
                  <p className="text-xs text-slate">처리 담당자</p>
                  <p className="font-medium">{memo.assignee.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* 이전 신고 이력 */}
          {history.length > 0 && (
            <div className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h3 className="text-sm font-semibold text-slate mb-3">
                동일 학생 이전 신고 이력
                <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-normal text-slate">
                  {history.length}건
                </span>
              </h3>
              <ul className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/admin/score-corrections/${h.id}`}
                          className="block truncate font-medium text-ink hover:text-ember hover:underline underline-offset-2"
                        >
                          {h.title}
                        </Link>
                        <p className="text-xs text-slate mt-0.5">{formatDate(h.createdAt)} · {h.owner.name}</p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[h.status]}`}
                      >
                        {STATUS_LABEL[h.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
