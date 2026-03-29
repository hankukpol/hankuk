import Link from "next/link";
import { notFound } from "next/navigation";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { hasDatabaseConfig } from "@/lib/env";
import { listStudentNotices } from "@/lib/notices/service";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

const TARGET_TYPE_LABEL: Record<string, string> = {
  ALL: "전체",
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const TARGET_TYPE_COLOR: Record<string, string> = {
  ALL: "border-forest/20 bg-forest/10 text-forest",
  GONGCHAE: "border-blue-200 bg-blue-50 text-blue-700",
  GYEONGCHAE: "border-purple-200 bg-purple-50 text-purple-700",
};

function formatRelativeDate(value: Date | null | undefined): string {
  const date = value ?? null;
  if (!date) return "-";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatFullDateTime(value: Date | null | undefined): string {
  const date = value ?? null;
  if (!date) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export default async function StudentNoticeDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Notice Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지 상세는 DB 연결이 있어야 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Notice Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지 상세를 보려면 로그인해 주세요.
            </h1>
          </section>

          <StudentLookupForm redirectPath={`/student/notices/${id}`} />
        </div>
      </main>
    );
  }

  const noticeId = Number(id);

  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    notFound();
  }

  const notices = await listStudentNotices(viewer.examType);
  const noticeIndex = notices.findIndex((item) => item.id === noticeId);

  if (noticeIndex === -1) {
    notFound();
  }

  const notice = notices[noticeIndex];
  // 목록은 isPinned desc → publishedAt desc 순서이므로, 이전/다음은 인덱스 기준
  const prevNotice = noticeIndex > 0 ? notices[noticeIndex - 1] : null;
  const nextNotice = noticeIndex < notices.length - 1 ? notices[noticeIndex + 1] : null;

  const publishedDate = notice.publishedAt ?? notice.createdAt;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* 헤더 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    TARGET_TYPE_COLOR[notice.targetType] ?? TARGET_TYPE_COLOR.ALL
                  }`}
                >
                  {TARGET_TYPE_LABEL[notice.targetType] ?? notice.targetType}
                </span>
                {notice.isPinned && (
                  <span className="inline-flex rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
                    고정
                  </span>
                )}
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
                {notice.title}
              </h1>
              <p className="mt-4 text-sm text-slate">
                {formatRelativeDate(publishedDate)}
                <span className="mx-2 text-ink/20">·</span>
                <span className="text-xs">{formatFullDateTime(publishedDate)}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/notices"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                목록으로
              </Link>
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                홈으로
              </Link>
            </div>
          </div>
        </section>

        {/* 고정 공지 안내 배너 */}
        {notice.isPinned && (
          <div className="flex items-center gap-3 rounded-[24px] border border-ember/20 bg-ember/5 px-5 py-4">
            <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ember/10 text-sm text-ember">
              📌
            </span>
            <p className="text-sm font-medium text-ember">
              이 공지는 상단에 고정된 중요 공지입니다.
            </p>
          </div>
        )}

        {/* 본문 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <RichTextViewer html={notice.content} />
        </section>

        {/* 이전 / 다음 공지 네비게이션 */}
        <nav className="grid gap-3 sm:grid-cols-2">
          {prevNotice ? (
            <Link
              href={`/student/notices/${prevNotice.id}`}
              className="group flex items-start gap-4 rounded-[28px] border border-ink/10 bg-white p-5 transition hover:border-ember/30 hover:shadow-sm"
            >
              <span className="mt-0.5 flex-shrink-0 text-lg text-slate group-hover:text-ember">
                ←
              </span>
              <div className="min-w-0">
                <p className="text-xs text-slate">이전 공지</p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold group-hover:text-ember">
                  {prevNotice.title}
                </p>
              </div>
            </Link>
          ) : (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-5">
              <p className="text-xs text-slate">이전 공지 없음</p>
            </div>
          )}

          {nextNotice ? (
            <Link
              href={`/student/notices/${nextNotice.id}`}
              className="group flex items-start gap-4 rounded-[28px] border border-ink/10 bg-white p-5 text-right transition hover:border-ember/30 hover:shadow-sm sm:flex-row-reverse"
            >
              <span className="mt-0.5 flex-shrink-0 text-lg text-slate group-hover:text-ember">
                →
              </span>
              <div className="min-w-0 sm:text-right">
                <p className="text-xs text-slate">다음 공지</p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold group-hover:text-ember">
                  {nextNotice.title}
                </p>
              </div>
            </Link>
          ) : (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-5 text-right">
              <p className="text-xs text-slate">다음 공지 없음</p>
            </div>
          )}
        </nav>

        {/* 목록으로 돌아가기 (하단) */}
        <div className="flex justify-center pb-4">
          <Link
            href="/student/notices"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}
