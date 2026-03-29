import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getSystemConfig } from "@/lib/system-config";
import { SmsConfigForm, type SmsConfigData } from "./sms-config-form";

export const dynamic = "force-dynamic";

export default async function SmsSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const config = await getSystemConfig();

  // Mask secrets: show only first 4 and last 4 chars
  function maskSecret(val: string): string {
    if (!val) return "";
    if (val.length <= 8) return "*".repeat(val.length);
    return val.slice(0, 4) + "*".repeat(val.length - 8) + val.slice(-4);
  }

  const formConfig: SmsConfigData = {
    kakaoEnabled: Boolean(config.kakaoChannelId || config.kakaoSenderId),
    kakaoChannelId: config.kakaoChannelId ?? "",
    kakaoApiKey: maskSecret(config.kakaoSenderId ?? ""),
    kakaoApiKeyRaw: config.kakaoSenderId ?? "",
    smsEnabled: Boolean(config.smsApiKey || config.smsSenderId),
    smsApiKey: maskSecret(config.smsApiKey ?? ""),
    smsApiKeyRaw: config.smsApiKey ?? "",
    smsSecretKey: maskSecret(config.smsApiSecret ?? ""),
    smsSecretKeyRaw: config.smsApiSecret ?? "",
    smsSender: config.smsSenderId ?? "",
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">SMS·알림 설정</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        카카오 알림톡 및 Solapi SMS 발송 설정을 관리합니다. API 키 변경 시 기존 발송 기능이 영향을 받을 수 있으니 주의하세요.
      </p>

      <div className="mt-8">
        <SmsConfigForm config={formConfig} />
      </div>
    </div>
  );
}
