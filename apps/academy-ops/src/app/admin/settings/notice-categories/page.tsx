import Link from "next/link";
import { AdminRole, NoticeTargetType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── 공지 대상 유형 레이블 ────────────────────────────────────────────────────

const TARGET_TYPE_LABEL: Record<NoticeTargetType, string> = {
  ALL: "전체",
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const TARGET_TYPE_DESCRIPTION: Record<NoticeTargetType, string> = {
  ALL: "모든 수강생에게 공개되는 공지사항",
  GONGCHAE: "공채(순경공채) 수강생 대상 공지사항",
  GYEONGCHAE: "경채(경찰경채) 수강생 대상 공지사항",
};

const TARGET_TYPE_BADGE: Record<NoticeTargetType, string> = {
  ALL: "border-forest/20 bg-forest/10 text-forest",
  GONGCHAE: "border-sky-200 bg-sky-50 text-sky-700",
  GYEONGCHAE: "border-purple-200 bg-purple-50 text-purple-700",
};

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function NoticeCategoriesSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  // 카테고리(대상 유형)별 공지 건수 집계
  const [categoryStats, recentNotices, totalNotices] = await Promise.all([
    prisma.notice.groupBy({
      by: ["targetType"],
      _count: { targetType: true },
      where: {},
    }),

    // 최근 10건 공지 목록 (미리보기)
    prisma.notice.findMany({
      select: {
        id: true,
        title: true,
        targetType: true,
        isPinned: true,
        isPublished: true,
        createdAt: true,
        publishedAt: true,
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),

    prisma.notice.count(),
  ]);

  // 게시 상태별 집계
  const [publishedCount, pinnedCount] = await Promise.all([
    prisma.notice.count({ where: { isPublished: true } }),
    prisma.notice.count({ where: { isPinned: true } }),
  ]);

  // categoryStats를 Map으로 변환
  const statsMap = new Map<NoticeTargetType, number>();
  for (const row of categoryStats) {
    statsMap.set(row.targetType, row._count.targetType);
  }

  const allTypes = Object.values(NoticeTargetType);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">공지 카테고리 현황</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        공지사항은 대상 유형(전체·공채·경채)으로 분류됩니다.
        카테고리별 공지 건수와 최근 공지 목록을 확인합니다.
      </p>

      {/* 안내 배너 */}
      <div className="mt-6 flex items-start gap-3 rounded-[20px] border border-sky-200 bg-sky-50/60 px-5 py-4">
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          className="mt-0.5 shrink-0 text-sky-600"
        >
          <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M9 8v5M9 5.5v.01"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm leading-relaxed text-sky-800">
          공지 카테고리는{" "}
          <strong>전체 / 공채 / 경채</strong> 세 가지 유형으로 고정되어 있습니다.
          공지사항을 작성할 때 대상 유형을 선택합니다.
          공지 작성 및 관리는{" "}
          <Link
            href="/admin/notices"
            className="font-semibold underline underline-offset-2 hover:text-sky-900"
          >
            공지사항 관리
          </Link>{" "}
          페이지에서 진행하세요.
        </p>
      </div>

      {/* KPI 카드 */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            전체 공지
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {totalNotices.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            게시 중
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {publishedCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건 공개됨</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            미게시
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate">
            {(totalNotices - publishedCount).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건 임시저장</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            고정 공지
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {pinnedCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건 상단 고정</p>
        </div>
      </div>

      {/* 카테고리별 현황 */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">카테고리별 공지 현황</h2>
        <p className="mt-1 text-xs text-slate">대상 유형별 전체 공지 건수</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {allTypes.map((type) => {
            const count = statsMap.get(type) ?? 0;
            return (
              <div
                key={type}
                className="rounded-[20px] border border-ink/10 bg-mist p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TARGET_TYPE_BADGE[type]}`}
                  >
                    {TARGET_TYPE_LABEL[type]}
                  </span>
                  <span className="text-2xl font-semibold text-ink tabular-nums">
                    {count.toLocaleString()}건
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate">
                  {TARGET_TYPE_DESCRIPTION[type]}
                </p>
                {totalNotices > 0 ? (
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full bg-ember/60"
                        style={{
                          width: `${Math.round((count / totalNotices) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-right text-xs text-slate">
                      {totalNotices > 0
                        ? `${Math.round((count / totalNotices) * 100)}%`
                        : "0%"}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* 상세 테이블 */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">카테고리 목록</h2>
        <p className="mt-1 text-xs text-slate">고정 유형으로 변경·추가·삭제할 수 없습니다.</p>
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  카테고리
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  설명
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  전체 공지
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  비율
                </th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {allTypes.map((type) => {
                const count = statsMap.get(type) ?? 0;
                const ratio =
                  totalNotices > 0
                    ? ((count / totalNotices) * 100).toFixed(1) + "%"
                    : "0.0%";
                return (
                  <tr
                    key={type}
                    className="transition-colors hover:bg-mist/60"
                  >
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TARGET_TYPE_BADGE[type]}`}
                      >
                        {TARGET_TYPE_LABEL[type]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate">
                      {TARGET_TYPE_DESCRIPTION[type]}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                      {count.toLocaleString()}건
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {ratio}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                        고정 유형
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/10 bg-mist/80">
                <td
                  className="px-5 py-3 text-xs font-semibold text-slate"
                  colSpan={2}
                >
                  합계
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
                  {totalNotices.toLocaleString()}건
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-slate">
                  100.0%
                </td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 최근 공지 목록 미리보기 */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">최근 공지 목록</h2>
            <p className="mt-1 text-xs text-slate">최근 10건</p>
          </div>
          <Link
            href="/admin/notices"
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
          >
            공지사항 관리 →
          </Link>
        </div>

        {recentNotices.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            등록된 공지사항이 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    제목
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    카테고리
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    고정
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    게시 상태
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    등록일
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {recentNotices.map((notice) => (
                  <tr
                    key={notice.id}
                    className="transition-colors hover:bg-mist/60"
                  >
                    <td className="max-w-xs px-5 py-3">
                      <p className="truncate font-medium text-ink">
                        {notice.title}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TARGET_TYPE_BADGE[notice.targetType]}`}
                      >
                        {TARGET_TYPE_LABEL[notice.targetType]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {notice.isPinned ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          고정
                        </span>
                      ) : (
                        <span className="text-xs text-slate">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {notice.isPublished ? (
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                          게시 중
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-slate">
                          임시저장
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-slate">
                      {notice.createdAt.toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 설정 목록
        </Link>
        <Link
          href="/admin/notices"
          className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
        >
          공지사항 관리 →
        </Link>
      </div>
    </div>
  );
}
