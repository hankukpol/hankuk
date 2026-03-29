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
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <h1 className="text-2xl font-bold text-amber-900">시스템 점검 안내</h1>
        <p className="mt-4 whitespace-pre-line text-sm text-amber-900 sm:text-base">{message}</p>
        <p className="mt-3 text-xs text-amber-800">점검이 완료되면 서비스가 자동으로 다시 열립니다.</p>
      </section>
    </main>
  );
}
