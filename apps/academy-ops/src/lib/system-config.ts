import { getPrisma } from "@/lib/prisma";

export type SystemConfigData = {
  // 운영 시간
  weekdayOpen: string;
  weekdayClose: string;
  weekendOpen: string;
  weekendClose: string;
  // 알림 설정
  kakaoChannelId: string;
  kakaoSenderId: string;
  smsApiKey: string;
  smsApiSecret: string;
  smsSenderId: string;
  // 환불 정책 (%)
  refundBeforeStart: number;
  refundBefore1Third: number;
  refundBefore1Half: number;
  refundAfter1Half: number;
  // 메타
  updatedAt: string | null;
};

export const DEFAULT_SYSTEM_CONFIG: SystemConfigData = {
  weekdayOpen: "09:00",
  weekdayClose: "21:00",
  weekendOpen: "09:00",
  weekendClose: "18:00",
  kakaoChannelId: "",
  kakaoSenderId: "",
  smsApiKey: "",
  smsApiSecret: "",
  smsSenderId: "",
  refundBeforeStart: 100,
  refundBefore1Third: 67,
  refundBefore1Half: 50,
  refundAfter1Half: 0,
  updatedAt: null,
};

export async function getSystemConfig(): Promise<SystemConfigData> {
  try {
    const row = await getPrisma().systemConfig.findUnique({
      where: { id: "singleton" },
    });
    if (!row) return { ...DEFAULT_SYSTEM_CONFIG };
    const raw = row.data as Record<string, unknown>;
    return {
      weekdayOpen: (raw.weekdayOpen as string) ?? DEFAULT_SYSTEM_CONFIG.weekdayOpen,
      weekdayClose: (raw.weekdayClose as string) ?? DEFAULT_SYSTEM_CONFIG.weekdayClose,
      weekendOpen: (raw.weekendOpen as string) ?? DEFAULT_SYSTEM_CONFIG.weekendOpen,
      weekendClose: (raw.weekendClose as string) ?? DEFAULT_SYSTEM_CONFIG.weekendClose,
      kakaoChannelId: (raw.kakaoChannelId as string) ?? DEFAULT_SYSTEM_CONFIG.kakaoChannelId,
      kakaoSenderId: (raw.kakaoSenderId as string) ?? DEFAULT_SYSTEM_CONFIG.kakaoSenderId,
      smsApiKey: (raw.smsApiKey as string) ?? DEFAULT_SYSTEM_CONFIG.smsApiKey,
      smsApiSecret: (raw.smsApiSecret as string) ?? DEFAULT_SYSTEM_CONFIG.smsApiSecret,
      smsSenderId: (raw.smsSenderId as string) ?? DEFAULT_SYSTEM_CONFIG.smsSenderId,
      refundBeforeStart:
        typeof raw.refundBeforeStart === "number"
          ? raw.refundBeforeStart
          : DEFAULT_SYSTEM_CONFIG.refundBeforeStart,
      refundBefore1Third:
        typeof raw.refundBefore1Third === "number"
          ? raw.refundBefore1Third
          : DEFAULT_SYSTEM_CONFIG.refundBefore1Third,
      refundBefore1Half:
        typeof raw.refundBefore1Half === "number"
          ? raw.refundBefore1Half
          : DEFAULT_SYSTEM_CONFIG.refundBefore1Half,
      refundAfter1Half:
        typeof raw.refundAfter1Half === "number"
          ? raw.refundAfter1Half
          : DEFAULT_SYSTEM_CONFIG.refundAfter1Half,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  } catch {
    return { ...DEFAULT_SYSTEM_CONFIG };
  }
}
