import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getNotice } from "@/lib/notices/service";
import { NoticeForm } from "../../notice-form";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditNoticePage({ params }: PageProps) {
  const { id } = await params;
  const noticeId = Number(id);

  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    notFound();
  }

  const [, notice] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    getNotice(noticeId),
  ]);

  if (!notice) {
    notFound();
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/notices" className="hover:text-ink">
          학생 공지
        </Link>
        <span>/</span>
        <Link href={`/admin/notices/${noticeId}`} className="hover:text-ink">
          공지 상세
        </Link>
        <span>/</span>
        <span className="text-ink">수정</span>
      </nav>

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-19 Student Notices
      </div>
      <h1 className="mt-5 text-3xl font-semibold">공지사항 수정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        기존 공지사항 내용을 수정합니다. 이미 게시된 공지의 경우 수정 내용이 즉시 반영됩니다.
      </p>

      <div className="mt-8">
        <NoticeForm
          noticeId={noticeId}
          defaultValues={{
            title: notice.title,
            content: notice.content,
            targetType: notice.targetType,
            isPinned: notice.isPinned,
            isPublished: notice.isPublished,
          }}
        />
      </div>
    </div>
  );
}
