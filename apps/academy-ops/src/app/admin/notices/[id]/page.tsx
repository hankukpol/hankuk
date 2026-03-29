import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getNotice } from "@/lib/notices/service";
import { NoticeDeleteButton } from "./notice-delete-button";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";

export const dynamic = "force-dynamic";

const TARGET_LABELS: Record<string, string> = {
  ALL: "전체 학생",
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function NoticeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const noticeId = Number(id);

  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    notFound();
  }

  const [context, notice] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    getNotice(noticeId),
  ]);

  if (!notice) {
    notFound();
  }

  const canEdit = roleAtLeast(context.adminUser.role, AdminRole.TEACHER);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/notices" className="hover:text-ink">
          학생 공지
        </Link>
        <span>/</span>
        <span className="text-ink">공지 상세</span>
      </nav>

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-19 Student Notices
      </div>
      <h1 className="mt-5 text-3xl font-semibold">공지 상세</h1>

      <div className="mt-8 space-y-6">
        {/* Notice card */}
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
              {TARGET_LABELS[notice.targetType] ?? notice.targetType}
            </span>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                notice.isPublished
                  ? "border-forest/20 bg-forest/10 text-forest"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {notice.isPublished ? "게시됨" : "임시저장"}
            </span>
            {notice.isPinned && (
              <span className="inline-flex rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
                고정
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="mt-4 text-2xl font-semibold">{notice.title}</h2>

          {/* Meta */}
          <p className="mt-3 text-xs text-slate">
            작성 {formatDateTime(notice.createdAt)} / 수정 {formatDateTime(notice.updatedAt)}
            {notice.publishedAt
              ? ` / 게시 ${formatDateTime(notice.publishedAt)}`
              : null}
          </p>

          {/* Content */}
          <div className="mt-6 rounded-[20px] bg-mist px-5 py-5">
            <RichTextViewer html={notice.content} />
          </div>
        </article>

        {/* Action buttons */}
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/admin/notices/${notice.id}/edit`}
              className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              수정
            </Link>
            <NoticeDeleteButton noticeId={notice.id} />
            <Link
              href="/admin/notices"
              className="inline-flex items-center rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ink/30"
            >
              목록으로
            </Link>
          </div>
        )}

        {!canEdit && (
          <div>
            <Link
              href="/admin/notices"
              className="inline-flex items-center rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ink/30"
            >
              목록으로
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
