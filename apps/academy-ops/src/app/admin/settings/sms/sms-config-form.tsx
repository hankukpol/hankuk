"use client";

import { useState } from "react";
import { toast } from "sonner";

export type SmsConfigData = {
  kakaoEnabled: boolean;
  kakaoChannelId: string;
  kakaoApiKey: string;       // masked display value
  kakaoApiKeyRaw: string;    // actual value for comparison
  smsEnabled: boolean;
  smsApiKey: string;         // masked display value
  smsApiKeyRaw: string;      // actual value
  smsSecretKey: string;      // masked display value
  smsSecretKeyRaw: string;   // actual value
  smsSender: string;
};

type Props = {
  config: SmsConfigData;
};

function EyeIcon({ show }: { show: boolean }) {
  if (show) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Toggle({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? "bg-forest" : "bg-ink/20"
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SecretInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "입력하세요"}
          className="w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 pr-10 text-sm text-ink placeholder:text-slate/40 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink"
          tabIndex={-1}
        >
          <EyeIcon show={show} />
        </button>
      </div>
    </div>
  );
}

export function SmsConfigForm({ config }: Props) {
  // Kakao state
  const [kakaoEnabled, setKakaoEnabled] = useState(config.kakaoEnabled);
  const [kakaoChannelId, setKakaoChannelId] = useState(config.kakaoChannelId);
  const [kakaoApiKey, setKakaoApiKey] = useState(config.kakaoApiKeyRaw);

  // SMS state
  const [smsEnabled, setSmsEnabled] = useState(config.smsEnabled);
  const [smsApiKey, setSmsApiKey] = useState(config.smsApiKeyRaw);
  const [smsSecretKey, setSmsSecretKey] = useState(config.smsSecretKeyRaw);
  const [smsSender, setSmsSender] = useState(config.smsSender);

  // Test send
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("academy-ops 강남 캠퍼스 알림 테스트 메시지입니다.");
  const [testType, setTestType] = useState<"kakao" | "sms">("sms");
  const [testLoading, setTestLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updates = [
        { key: "kakaoChannelId", value: kakaoChannelId },
        { key: "kakaoSenderId", value: kakaoApiKey },
        { key: "smsApiKey", value: smsApiKey },
        { key: "smsApiSecret", value: smsSecretKey },
        { key: "smsSenderId", value: smsSender },
      ];

      const res = await fetch("/api/settings/sms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const json = await res.json() as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success("설정이 저장되었습니다.");
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSend() {
    if (!testPhone.trim()) {
      toast.error("테스트 발송 번호를 입력하세요.");
      return;
    }
    setTestLoading(true);
    try {
      const res = await fetch("/api/settings/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: testType,
          phone: testPhone.trim(),
          message: testMessage.trim() || "테스트 메시지",
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "테스트 발송에 실패했습니다.");
        return;
      }
      toast.success("테스트 메시지가 발송되었습니다.");
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setTestLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm text-ink placeholder:text-slate/40 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/10";
  const labelClass = "mb-1.5 block text-xs font-medium text-slate";

  return (
    <div className="space-y-6">
      {/* Section 1: Kakao Alimtalk */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">카카오 알림톡</h2>
            <p className="mt-0.5 text-sm text-slate">
              카카오 비즈니스 채널 연동 설정입니다.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate">{kakaoEnabled ? "활성" : "비활성"}</span>
            <Toggle
              enabled={kakaoEnabled}
              onChange={setKakaoEnabled}
              label="카카오 알림톡 활성화"
            />
          </div>
        </div>

        <div
          className={`mt-6 grid gap-4 transition-opacity sm:grid-cols-2 ${kakaoEnabled ? "" : "pointer-events-none opacity-40"}`}
        >
          <div>
            <label className={labelClass}>채널 ID</label>
            <input
              type="text"
              value={kakaoChannelId}
              onChange={(e) => setKakaoChannelId(e.target.value)}
              placeholder="@채널명 또는 채널 ID"
              className={inputClass}
            />
          </div>
          <SecretInput
            label="Solapi PF ID / 카카오 API Key"
            value={kakaoApiKey}
            onChange={setKakaoApiKey}
            placeholder="pfId 또는 API Key"
          />
        </div>

        {kakaoEnabled ? (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            카카오 알림톡은 Solapi API와 연동하여 발송됩니다. Solapi 콘솔에서 카카오 채널을 연결해야 합니다.
          </div>
        ) : null}
      </div>

      {/* Section 2: SMS */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">SMS (Solapi)</h2>
            <p className="mt-0.5 text-sm text-slate">
              Solapi API를 통한 문자 발송 설정입니다.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate">{smsEnabled ? "활성" : "비활성"}</span>
            <Toggle
              enabled={smsEnabled}
              onChange={setSmsEnabled}
              label="SMS 활성화"
            />
          </div>
        </div>

        <div
          className={`mt-6 grid gap-4 transition-opacity sm:grid-cols-2 ${smsEnabled ? "" : "pointer-events-none opacity-40"}`}
        >
          <SecretInput
            label="API Key"
            value={smsApiKey}
            onChange={setSmsApiKey}
            placeholder="Solapi API Key"
          />
          <SecretInput
            label="API Secret"
            value={smsSecretKey}
            onChange={setSmsSecretKey}
            placeholder="Solapi API Secret"
          />
          <div>
            <label className={labelClass}>발신 번호</label>
            <input
              type="text"
              value={smsSender}
              onChange={(e) => setSmsSender(e.target.value)}
              placeholder="01012345678"
              className={inputClass}
            />
          </div>
        </div>

        {/* Test Send */}
        <div className={`mt-6 border-t border-ink/5 pt-6 transition-opacity ${smsEnabled ? "" : "pointer-events-none opacity-40"}`}>
          <h3 className="mb-3 text-sm font-semibold text-ink">테스트 발송</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>발송 채널</label>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value as "kakao" | "sms")}
                className={inputClass}
              >
                <option value="sms">SMS</option>
                <option value="kakao">카카오 알림톡</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>수신 번호</label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="01012345678"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>메시지 내용</label>
              <textarea
                rows={2}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              type="button"
              disabled={testLoading}
              onClick={handleTestSend}
              className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/5 px-5 py-2 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testLoading ? "발송 중..." : "테스트 발송"}
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between rounded-[28px] border border-ink/10 bg-white px-6 py-5">
        <p className="text-sm text-slate">
          변경사항을 저장하면 즉시 적용됩니다.
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-full bg-forest px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* Quick Links */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">바로가기</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/admin/settings/notification-templates"
            className="inline-flex items-center gap-2 rounded-2xl border border-forest/20 bg-forest/10 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20"
          >
            알림 템플릿 관리
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H6M11 3v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <a
            href="/admin/settings/notifications"
            className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-mist"
          >
            발송 이력 확인
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H6M11 3v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
