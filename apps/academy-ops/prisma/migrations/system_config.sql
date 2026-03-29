-- migration: system_config
-- 시스템 전체 설정 (운영 시간, 알림, 수납 환불 정책 등) — 단일 행 JSON 저장

CREATE TABLE IF NOT EXISTS "system_config" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "data" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" UUID,
  CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "system_config" ("id", "data", "updatedAt") VALUES (
  'singleton',
  '{
    "weekdayOpen": "09:00",
    "weekdayClose": "21:00",
    "weekendOpen": "09:00",
    "weekendClose": "18:00",
    "kakaoChannelId": "",
    "kakaoSenderId": "",
    "smsApiKey": "",
    "smsApiSecret": "",
    "smsSenderId": "",
    "refundBeforeStart": 100,
    "refundBefore1Third": 67,
    "refundBefore1Half": 50,
    "refundAfter1Half": 0
  }',
  NOW()
) ON CONFLICT DO NOTHING;
