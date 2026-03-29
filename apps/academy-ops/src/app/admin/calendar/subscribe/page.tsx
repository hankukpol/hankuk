import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { hasIcalFeedSecret } from "@/lib/calendar/ical-feed";

export const dynamic = "force-dynamic";

// ── page ─────────────────────────────────────────────────────────────────────

export default async function CalendarSubscribePage() {
  await requireAdminContext(AdminRole.VIEWER);

  const isConfigured = hasIcalFeedSecret();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ?? "";
  const sampleUrl = appUrl
    ? `${appUrl}/api/calendar/ical?periodId=1&examType=GONGCHAE&token=...`
    : `/api/calendar/ical?periodId=1&examType=GONGCHAE&token=...`;

  return (
    <div className="p-6 sm:p-10 max-w-3xl">
      {/* Back link */}
      <Link
        href="/admin/calendar"
        className="text-sm text-slate transition hover:text-ember"
      >
        ← 일정 캘린더
      </Link>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        iCal 구독
      </div>
      <h1 className="mt-4 text-3xl font-semibold">캘린더 구독 안내</h1>
      <p className="mt-2 text-sm leading-7 text-slate">
        시험 일정을 Google 캘린더, Apple 캘린더 등 외부 캘린더 앱에 구독할 수 있습니다.
        구독 링크는 시험 기간별로 생성되며 자동으로 최신 일정이 동기화됩니다.
      </p>

      {/* Status banner */}
      {!isConfigured ? (
        <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">iCal 구독 기능이 비활성화 상태입니다</p>
              <p className="mt-1 text-xs text-amber-700">
                환경 변수 <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">ICAL_FEED_SECRET</code>이
                설정되지 않았습니다. 서버 관리자에게 문의하세요.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-[20px] border border-forest/20 bg-forest/10 p-5">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-forest">iCal 구독 기능이 활성화되었습니다</p>
              <p className="mt-1 text-xs text-slate">
                아래 안내에 따라 출결 캘린더 페이지에서 구독 링크를 생성하세요.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step guide */}
      <section className="mt-8">
        <h2 className="mb-4 text-base font-semibold text-ink">구독 링크 생성 방법</h2>
        <ol className="space-y-4">
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember text-white text-sm font-bold">1</span>
            <div className="pt-1">
              <p className="text-sm font-semibold text-ink">출결 캘린더 페이지로 이동</p>
              <p className="mt-1 text-xs text-slate">
                상단 메뉴에서 <strong>출결 관리 → 출결 캘린더</strong>로 이동하거나
                아래 버튼을 클릭하세요.
              </p>
              <Link
                href="/admin/attendance/calendar"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember hover:text-white"
              >
                출결 캘린더 바로가기 →
              </Link>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember text-white text-sm font-bold">2</span>
            <div className="pt-1">
              <p className="text-sm font-semibold text-ink">시험 기간 및 직렬 선택</p>
              <p className="mt-1 text-xs text-slate">
                구독할 시험 기간과 직렬(공채/경채)을 선택합니다.
                각 기간·직렬 조합마다 고유한 구독 링크가 생성됩니다.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember text-white text-sm font-bold">3</span>
            <div className="pt-1">
              <p className="text-sm font-semibold text-ink">구독 링크 복사</p>
              <p className="mt-1 text-xs text-slate">
                페이지 하단의 <strong>iCal 구독 링크</strong> 섹션에서 링크를 복사합니다.
                URL 형식:
              </p>
              <code className="mt-2 block w-full overflow-x-auto rounded-[12px] bg-ink/5 px-3 py-2 font-mono text-xs text-ink/70">
                {sampleUrl}
              </code>
            </div>
          </li>
        </ol>
      </section>

      {/* Instructions by calendar app */}
      <section className="mt-10">
        <h2 className="mb-4 text-base font-semibold text-ink">캘린더 앱별 구독 방법</h2>

        <div className="space-y-4">
          {/* Google Calendar */}
          <div className="rounded-[20px] border border-ink/10 bg-white p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink">Google 캘린더</h3>
            </div>
            <ol className="space-y-2 text-xs text-slate">
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">1.</span>
                <span>Google 캘린더(calendar.google.com)를 엽니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">2.</span>
                <span>왼쪽 사이드바의 <strong>다른 캘린더</strong> 옆의 <strong>+</strong> 버튼 클릭 → <strong>URL로 구독</strong> 선택.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">3.</span>
                <span>복사한 구독 URL을 붙여넣고 <strong>캘린더 추가</strong>를 클릭합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">4.</span>
                <span>Google 캘린더는 대략 12~24시간 주기로 자동 동기화됩니다.</span>
              </li>
            </ol>
          </div>

          {/* Apple Calendar */}
          <div className="rounded-[20px] border border-ink/10 bg-white p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-50">
                <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink">Apple 캘린더 (macOS / iOS)</h3>
            </div>
            <ol className="space-y-2 text-xs text-slate">
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">1.</span>
                <span><strong>macOS:</strong> 캘린더 앱 → 메뉴 <strong>파일 → 새 캘린더 구독</strong>.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">2.</span>
                <span><strong>iOS/iPadOS:</strong> 설정 → 캘린더 → 계정 → 계정 추가 → 기타 → 구독 캘린더 추가.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">3.</span>
                <span>복사한 구독 URL을 붙여넣고 <strong>다음</strong>을 탭합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">4.</span>
                <span>자동 새로 고침 주기를 설정하고 <strong>저장</strong>을 탭합니다.</span>
              </li>
            </ol>
          </div>

          {/* Outlook */}
          <div className="rounded-[20px] border border-ink/10 bg-white p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                <svg className="h-5 w-5 text-blue-700" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 6V4H5v2H3v2h2v2h2V8h2V6H7zm10 0h-2v2h-2v2h2v2h2v-2h2V8h-2V6zM3 14v2h2v2h2v-2h2v-2H7v-2H5v2H3zm14 0v-2h-2v2h-2v2h2v2h2v-2h2v-2h-2z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink">Microsoft Outlook</h3>
            </div>
            <ol className="space-y-2 text-xs text-slate">
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">1.</span>
                <span>Outlook 웹(outlook.live.com) → 캘린더 보기로 이동.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">2.</span>
                <span><strong>캘린더 추가</strong> → <strong>인터넷에서 구독</strong> 선택.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-ink shrink-0">3.</span>
                <span>구독 URL을 붙여넣고 <strong>가져오기</strong>를 클릭합니다.</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="mt-8 rounded-[20px] border border-ink/10 bg-mist p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">주의 사항</h3>
        <ul className="space-y-2 text-xs text-slate">
          <li className="flex gap-2">
            <span className="text-ember">•</span>
            <span>구독 링크는 <strong>개인 전용</strong>입니다. 다른 사람에게 공유하지 마세요.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-ember">•</span>
            <span>계정이 비활성화되면 구독 링크도 자동으로 만료됩니다.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-ember">•</span>
            <span>동기화 주기는 캘린더 앱에 따라 다릅니다 (Google: 12~24시간, Apple: 설정 가능).</span>
          </li>
          <li className="flex gap-2">
            <span className="text-ember">•</span>
            <span>시험 기간이 변경되면 새 구독 링크를 생성해야 합니다.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
