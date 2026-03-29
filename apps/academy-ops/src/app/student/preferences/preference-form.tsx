"use client";

import { useState } from "react";

type PreferenceFormProps = {
  initialNotificationConsent: boolean;
};

function Toggle({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-ember" : "bg-ink/20"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function PreferenceForm({ initialNotificationConsent }: PreferenceFormProps) {
  const [notificationConsent, setNotificationConsent] = useState(initialNotificationConsent);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [scoreAlerts, setScoreAlerts] = useState(initialNotificationConsent);
  const [enrollmentAlerts, setEnrollmentAlerts] = useState(initialNotificationConsent);
  const [noticeAlerts, setNoticeAlerts] = useState(initialNotificationConsent);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // When master notification consent is toggled, sync all sub-toggles
  function handleNotificationConsentChange(v: boolean) {
    setNotificationConsent(v);
    if (!v) {
      setScoreAlerts(false);
      setEnrollmentAlerts(false);
      setNoticeAlerts(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus("idle");
    setSaveError("");

    try {
      const res = await fetch("/api/student/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationConsent }),
      });

      const json = (await res.json()) as { data?: unknown; error?: string };

      if (!res.ok) {
        setSaveError(json.error ?? "저장에 실패했습니다.");
        setSaveStatus("error");
        return;
      }

      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 카카오 알림톡 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">알림 수신 동의</h2>
        <p className="mt-1 text-sm text-slate">
          카카오 알림톡으로 학원 주요 안내를 수신합니다.
        </p>

        <div className="mt-5 space-y-4">
          {/* Master toggle */}
          <div className="flex items-center justify-between gap-4 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="toggle-notification"
                className="cursor-pointer text-sm font-semibold text-ink"
              >
                카카오 알림톡 수신
              </label>
              <p className="mt-0.5 text-xs text-slate">
                수강 관련 필수 안내, 결제 내역, 공지사항 등을 카카오톡으로 받습니다.
              </p>
            </div>
            <Toggle
              id="toggle-notification"
              checked={notificationConsent}
              onChange={handleNotificationConsentChange}
            />
          </div>

          {/* Sub-toggles — only shown when master is on */}
          <div
            className={`space-y-3 transition-opacity duration-200 ${
              notificationConsent ? "opacity-100" : "pointer-events-none opacity-40"
            }`}
          >
            <div className="flex items-center justify-between gap-4 rounded-[20px] border border-ink/10 bg-white px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="toggle-score"
                  className="cursor-pointer text-sm font-medium text-ink"
                >
                  성적 발표 알림
                </label>
                <p className="mt-0.5 text-xs text-slate">모의고사 성적이 공개되면 알림을 보냅니다.</p>
              </div>
              <Toggle
                id="toggle-score"
                checked={scoreAlerts}
                onChange={setScoreAlerts}
                disabled={!notificationConsent}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-[20px] border border-ink/10 bg-white px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="toggle-enrollment"
                  className="cursor-pointer text-sm font-medium text-ink"
                >
                  수강 만료 알림
                </label>
                <p className="mt-0.5 text-xs text-slate">수강 기간 만료 7일 전에 미리 알립니다.</p>
              </div>
              <Toggle
                id="toggle-enrollment"
                checked={enrollmentAlerts}
                onChange={setEnrollmentAlerts}
                disabled={!notificationConsent}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-[20px] border border-ink/10 bg-white px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="toggle-notice"
                  className="cursor-pointer text-sm font-medium text-ink"
                >
                  공지사항 알림
                </label>
                <p className="mt-0.5 text-xs text-slate">학원 중요 공지사항을 알림으로 받습니다.</p>
              </div>
              <Toggle
                id="toggle-notice"
                checked={noticeAlerts}
                onChange={setNoticeAlerts}
                disabled={!notificationConsent}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 마케팅 수신 동의 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">마케팅 정보 수신 동의</h2>
        <p className="mt-1 text-sm text-slate">
          이벤트, 할인 혜택 등 마케팅 정보를 수신합니다. 거부 시에도 필수 알림은 정상 발송됩니다.
        </p>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-4 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="toggle-marketing"
                className="cursor-pointer text-sm font-semibold text-ink"
              >
                마케팅 수신 동의
              </label>
              <p className="mt-0.5 text-xs text-slate">
                이벤트 안내, 할인 혜택 등 홍보성 정보를 카카오톡으로 받습니다. (선택)
              </p>
            </div>
            <Toggle
              id="toggle-marketing"
              checked={marketingConsent}
              onChange={setMarketingConsent}
            />
          </div>
        </div>
      </div>

      {/* Save status */}
      {saveStatus === "success" && (
        <div className="rounded-2xl border border-forest/20 bg-forest/5 px-5 py-3 text-sm font-medium text-forest">
          환경설정이 저장되었습니다.
        </div>
      )}
      {saveStatus === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:bg-ember/40"
        >
          {isSaving ? "저장 중..." : "저장하기"}
        </button>
      </div>
    </form>
  );
}
