import { getSiteSettings } from "@/lib/site-settings";

export default async function MaintenancePage() {
  let message = "시스템 점검 중입니다.";

  try {
    const settings = await getSiteSettings();
    const configuredMessage = settings["site.maintenanceMessage"];
    if (typeof configuredMessage === "string" && configuredMessage.trim()) {
      message = configuredMessage;
    }
  } catch {
    // 기본 점검 문구 사용
  }

  return (
    <main className="pb-16">
      <div className="user-content-frame pt-[100px]">
        <div className="mx-auto w-full max-w-[768px]">
          {/* 페이지 최상위에 단독으로 놓이는 상태 알림이라 카드 형태를 유지한다. */}
          <section className="w-full rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
            <h1 className="user-page-title">시스템 점검 안내</h1>
            <p className="mt-4 whitespace-pre-line text-sm text-amber-900 sm:text-base">{message}</p>
            <p className="mt-3 text-xs text-amber-800">점검이 완료되면 서비스가 자동으로 다시 열립니다.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
