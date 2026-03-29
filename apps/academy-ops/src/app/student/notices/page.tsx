import Link from "next/link";
import { StudentPushSubscriptionCard } from "@/components/student-portal/student-push-subscription-card";
import { hasDatabaseConfig } from "@/lib/env";
import { listStudentNotices } from "@/lib/notices/service";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

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

function isRecent(value: Date | null) {
  if (!value) return false;
  return Date.now() - value.getTime() <= 1000 * 60 * 60 * 24 * 7;
}

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

export default async function StudentNoticesPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Notices Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지사항 보드는 DB 연결이 필요합니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에서는 학생과 공지 데이터가 연결되지 않아 공지사항을 불러올 수 없습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 돌아가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const student = await getStudentPortalViewer();

  if (!student) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Notices Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지사항은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에서 로그인한 뒤 본인 직렬에 맞는 공지사항을 다시 불러와 주세요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student/login?redirectTo=/student/notices"
                className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
              >
                로그인
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const notices = await listStudentNotices(student.examType);
  const pinnedNotices = notices.filter((n) => n.isPinned);
  const regularNotices = notices.filter((n) => !n.isPinned);

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* 헤더 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Student Notices
          </div>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">공지사항</h1>
              <p className="mt-5 max-w-3xl text-sm leading-8 text-slate sm:text-base">
                공개된 전체 공지와 {student.name}님의 직렬 공지를 함께 보여줍니다.
              </p>
            </div>
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털 홈으로 돌아가기
            </Link>
          </div>
        </section>

        <StudentPushSubscriptionCard studentName={student.name} />

        {/* 고정 공지 섹션 */}
        {pinnedNotices.length > 0 && (
          <section className="rounded-[32px] border border-ember/20 bg-ember/5 p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full border border-ember/30 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ember">
                고정 공지
              </span>
              <span className="text-sm font-medium text-ember">{pinnedNotices.length}건</span>
            </div>
            <div className="mt-5 space-y-3">
              {pinnedNotices.map((notice) => (
                <article
                  key={notice.id}
                  className="rounded-[24px] border border-ember/20 bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                            TARGET_TYPE_COLOR[notice.targetType] ?? TARGET_TYPE_COLOR.ALL
                          }`}
                        >
                          {TARGET_TYPE_LABEL[notice.targetType] ?? notice.targetType}
                        </span>
                        <span className="inline-flex rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
                          고정
                        </span>
                        {isRecent(notice.publishedAt) && (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                            NEW
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/student/notices/${notice.id}`}
                        className="mt-3 block text-xl font-semibold hover:text-ember"
                      >
                        {notice.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate">
                        {formatRelativeDate(notice.publishedAt ?? notice.createdAt)}
                      </p>
                    </div>
                    <Link
                      href={`/student/notices/${notice.id}`}
                      className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
                    >
                      자세히 보기
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* 일반 공지 목록 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">{student.name}님 공지 보드</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                {notices.length}개의 공지가 공개되어 있습니다.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {notices.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-ink/10 py-16 text-center">
                <div className="text-4xl">📭</div>
                <p className="mt-4 text-base font-semibold text-ink">공지사항이 없습니다</p>
                <p className="mt-2 text-sm text-slate">
                  현재 공개된 공지사항이 없습니다. 나중에 다시 확인해 주세요.
                </p>
              </div>
            ) : regularNotices.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
                고정 공지 외에 일반 공지가 없습니다.
              </div>
            ) : null}

            {regularNotices.map((notice) => (
              <article
                key={notice.id}
                className="rounded-[24px] border border-ink/10 p-5 transition hover:border-ink/20 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          TARGET_TYPE_COLOR[notice.targetType] ?? TARGET_TYPE_COLOR.ALL
                        }`}
                      >
                        {TARGET_TYPE_LABEL[notice.targetType] ?? notice.targetType}
                      </span>
                      {isRecent(notice.publishedAt) && (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                          NEW
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/student/notices/${notice.id}`}
                      className="mt-3 block text-xl font-semibold hover:text-ember"
                    >
                      {notice.title}
                    </Link>
                    <p className="mt-1 text-xs text-slate">
                      {formatRelativeDate(notice.publishedAt ?? notice.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/student/notices/${notice.id}`}
                    className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                  >
                    자세히 보기
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
