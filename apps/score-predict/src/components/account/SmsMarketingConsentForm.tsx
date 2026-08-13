"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ConsentResponse = {
  consented?: boolean;
  consentAt?: string | null;
  withdrawnAt?: string | null;
  consentText?: string;
  error?: string;
  message?: string;
};

export default function SmsMarketingConsentForm() {
  const [consented, setConsented] = useState(false);
  const [consentText, setConsentText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account/sms-marketing-consent", { cache: "no-store" });
        const data = (await response.json()) as ConsentResponse;
        if (!response.ok) throw new Error(data.error ?? "문자 수신 설정을 불러오지 못했습니다.");
        if (!cancelled) {
          setConsented(Boolean(data.consented));
          setConsentText(data.consentText ?? "");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "문자 수신 설정을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/sms-marketing-consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consented }),
      });
      const data = (await response.json()) as ConsentResponse;
      if (!response.ok) throw new Error(data.error ?? "문자 수신 설정을 저장하지 못했습니다.");
      setMessage(data.message ?? "문자 수신 설정을 저장했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "문자 수신 설정을 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900">문자 수신 설정</h1>
      <p className="mt-2 text-sm text-slate-600">
        합격예측 서비스 이용과 별개인 선택 동의입니다. 동의하지 않아도 채점과 합격예측을 이용할 수 있습니다.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-500">설정을 불러오는 중...</p>
      ) : (
        <div className="mt-6 space-y-5">
          <label className="flex items-start gap-3 border-y border-slate-200 bg-slate-50 px-4 py-4">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-service-600 focus:ring-service-500"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">한국경찰학원 홍보 문자 수신 동의 (선택)</span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">{consentText}</span>
            </span>
          </label>

          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}

          <Button type="button" onClick={() => void save()} disabled={isSaving}>
            {isSaving ? "저장 중..." : "설정 저장"}
          </Button>
        </div>
      )}
    </section>
  );
}
