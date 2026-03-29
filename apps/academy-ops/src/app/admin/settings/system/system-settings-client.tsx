"use client";

import { useState, useTransition } from "react";
import type { SystemConfigData } from "@/lib/system-config";

type Tab = "academy" | "hours" | "notifications" | "payments";

const TABS: { id: Tab; label: string }[] = [
  { id: "academy", label: "학원 정보" },
  { id: "hours", label: "운영 시간" },
  { id: "notifications", label: "알림 설정" },
  { id: "payments", label: "수납 설정" },
];

type AcademyFields = {
  name: string;
  directorName: string;
  businessRegNo: string;
  academyRegNo: string;
  address: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  websiteUrl: string;
};

type Props = {
  config: SystemConfigData;
  academy: AcademyFields;
  canEditAcademyInfo: boolean;
};

function inputCls() {
  return "flex-1 min-w-0 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30";
}

function rowCls() {
  return "flex items-center gap-4 px-6 py-4";
}

function labelCls() {
  return "w-44 shrink-0 text-xs font-semibold text-slate";
}

export function SystemSettingsClient({
  config: initialConfig,
  academy: initialAcademy,
  canEditAcademyInfo,
}: Props) {
  const [tab, setTab] = useState<Tab>("academy");
  const [config, setConfig] = useState<SystemConfigData>(initialConfig);
  const [academy, setAcademy] = useState<AcademyFields>(initialAcademy);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  function showToast(type: "ok" | "err", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function handleSave() {
    startTransition(async () => {
      if (tab === "academy" && !canEditAcademyInfo) {
        showToast("err", "지점을 선택한 뒤 학원 정보를 수정할 수 있습니다.");
        return;
      }

      // 학원 정보 탭은 /api/settings/academy (PUT)
      // 나머지 탭은 /api/settings/system (PATCH)
      try {
        const requests = [
          fetch("/api/settings/system", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: config }),
          }),
        ];

        if (canEditAcademyInfo) {
          requests.unshift(
            fetch("/api/settings/academy", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(academy),
            }),
          );
        }

        const responses = await Promise.all(requests);
        const resAcademy = canEditAcademyInfo ? responses[0] : null;
        const resSystem = responses[responses.length - 1];

        if ((resAcademy && !resAcademy.ok) || !resSystem.ok) {
          const failedResponse = resAcademy && !resAcademy.ok ? resAcademy : resSystem;
          const errData = await failedResponse.json();
          showToast("err", errData?.error ?? "저장 실패");
          return;
        }
        showToast("ok", "저장되었습니다.");
      } catch {
        showToast("err", "네트워크 오류가 발생했습니다.");
      }
    });
  }

  function setNum(field: keyof SystemConfigData, value: string) {
    const n = parseInt(value, 10);
    setConfig((prev) => ({ ...prev, [field]: isNaN(n) ? 0 : Math.max(0, Math.min(100, n)) }));
  }

  return (
    <div className="space-y-6">
      {/* 탭 헤더 */}
      <div className="border-b border-ink/10">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "px-4 py-3 text-sm font-semibold transition border-b-2 -mb-px",
                tab === t.id
                  ? "border-forest text-forest"
                  : "border-transparent text-slate hover:text-ink",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          className={[
            "rounded-2xl border px-4 py-3 text-sm",
            toast.type === "ok"
              ? "border-forest/20 bg-forest/10 text-forest"
              : "border-red-200 bg-red-50 text-red-700",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}

      {/* 학원 정보 탭 */}
      {tab === "academy" && (
        <div className="overflow-hidden rounded-[28px] border border-ink/10">
          <div className="divide-y divide-ink/10">
            {(
              [
                { key: "name" as const, label: "학원명 *", placeholder: "예: academy-ops 강남 캠퍼스" },
                { key: "directorName" as const, label: "원장명", placeholder: "예: 홍길동" },
                {
                  key: "businessRegNo" as const,
                  label: "사업자등록번호",
                  placeholder: "예: 123-45-67890",
                },
                {
                  key: "academyRegNo" as const,
                  label: "학원등록번호",
                  placeholder: "예: 제2024-대구중구-001호",
                },
                {
                  key: "address" as const,
                  label: "주소",
                  placeholder: "예: 대구광역시 중구 중앙대로 390",
                },
                { key: "phone" as const, label: "대표 전화", placeholder: "예: 02-555-1234" },
                { key: "bankName" as const, label: "은행명", placeholder: "예: 농협은행" },
                {
                  key: "bankAccount" as const,
                  label: "계좌번호",
                  placeholder: "예: 123-4567-8901-23",
                },
                { key: "bankHolder" as const, label: "예금주", placeholder: "예: academy-ops 강남 캠퍼스" },
                {
                  key: "websiteUrl" as const,
                  label: "홈페이지 URL",
                  placeholder: "예: https://www.example.com",
                },
              ] as { key: keyof AcademyFields; label: string; placeholder: string }[]
            ).map(({ key, label, placeholder }) => (
              <div key={key} className={rowCls()}>
                <label className={labelCls()}>{label}</label>
                <input
                  type="text"
                  value={academy[key]}
                  onChange={(e) => setAcademy((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={inputCls()}
                  disabled={!canEditAcademyInfo}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 운영 시간 탭 */}
      {tab === "hours" && (
        <div className="overflow-hidden rounded-[28px] border border-ink/10">
          <div className="divide-y divide-ink/10">
            <div className="px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">평일</p>
            </div>
            <div className={rowCls()}>
              <label className={labelCls()}>평일 운영 시작</label>
              <input
                type="time"
                value={config.weekdayOpen}
                onChange={(e) => setConfig((prev) => ({ ...prev, weekdayOpen: e.target.value }))}
                className={inputCls()}
              />
            </div>
            <div className={rowCls()}>
              <label className={labelCls()}>평일 운영 종료</label>
              <input
                type="time"
                value={config.weekdayClose}
                onChange={(e) => setConfig((prev) => ({ ...prev, weekdayClose: e.target.value }))}
                className={inputCls()}
              />
            </div>
            <div className="px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">주말</p>
            </div>
            <div className={rowCls()}>
              <label className={labelCls()}>주말 운영 시작</label>
              <input
                type="time"
                value={config.weekendOpen}
                onChange={(e) => setConfig((prev) => ({ ...prev, weekendOpen: e.target.value }))}
                className={inputCls()}
              />
            </div>
            <div className={rowCls()}>
              <label className={labelCls()}>주말 운영 종료</label>
              <input
                type="time"
                value={config.weekendClose}
                onChange={(e) => setConfig((prev) => ({ ...prev, weekendClose: e.target.value }))}
                className={inputCls()}
              />
            </div>
            <div className="px-6 py-4 bg-mist/50">
              <p className="text-xs text-slate">
                현재 설정: 평일{" "}
                <span className="font-semibold text-ink">
                  {config.weekdayOpen} ~ {config.weekdayClose}
                </span>
                , 주말{" "}
                <span className="font-semibold text-ink">
                  {config.weekendOpen} ~ {config.weekendClose}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 알림 설정 탭 */}
      {tab === "notifications" && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[28px] border border-ink/10">
            <div className="divide-y divide-ink/10">
              <div className="px-6 py-4 bg-mist/30">
                <p className="text-xs font-semibold uppercase tracking-widest text-forest">
                  카카오 알림톡
                </p>
              </div>
              <div className={rowCls()}>
                <label className={labelCls()}>카카오 채널 ID</label>
                <input
                  type="text"
                  value={config.kakaoChannelId}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, kakaoChannelId: e.target.value }))
                  }
                  placeholder="예: @academy_ops"
                  className={inputCls()}
                />
              </div>
              <div className={rowCls()}>
                <label className={labelCls()}>알림톡 발신 번호</label>
                <input
                  type="text"
                  value={config.kakaoSenderId}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, kakaoSenderId: e.target.value }))
                  }
                  placeholder="예: 02-555-1234"
                  className={inputCls()}
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-ink/10">
            <div className="divide-y divide-ink/10">
              <div className="px-6 py-4 bg-mist/30">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate">
                  SMS 설정 (선택)
                </p>
                <p className="mt-1 text-xs text-slate">
                  카카오 알림톡은 SMS 설정 없이도 동작합니다.
                </p>
              </div>
              <div className={rowCls()}>
                <label className={labelCls()}>SMS API Key</label>
                <input
                  type="text"
                  value={config.smsApiKey}
                  onChange={(e) => setConfig((prev) => ({ ...prev, smsApiKey: e.target.value }))}
                  placeholder="Solapi API Key"
                  className={inputCls()}
                />
              </div>
              <div className={rowCls()}>
                <label className={labelCls()}>SMS API Secret</label>
                <input
                  type="password"
                  value={config.smsApiSecret}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, smsApiSecret: e.target.value }))
                  }
                  placeholder="Solapi API Secret"
                  className={inputCls()}
                />
              </div>
              <div className={rowCls()}>
                <label className={labelCls()}>SMS 발신 번호</label>
                <input
                  type="text"
                  value={config.smsSenderId}
                  onChange={(e) => setConfig((prev) => ({ ...prev, smsSenderId: e.target.value }))}
                  placeholder="예: 02-555-1234"
                  className={inputCls()}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 수납 설정 탭 */}
      {tab === "payments" && (
        <div className="overflow-hidden rounded-[28px] border border-ink/10">
          <div className="divide-y divide-ink/10">
            <div className="px-6 py-4 bg-mist/30">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">
                환불 정책 (학원법 기준, %)
              </p>
              <p className="mt-1 text-xs text-slate">
                수업 시작 전 / 수업 진행률에 따른 환불 비율을 설정합니다.
              </p>
            </div>
            <div className={rowCls()}>
              <label className={labelCls()}>수업 시작 전</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.refundBeforeStart}
                  onChange={(e) => setNum("refundBeforeStart", e.target.value)}
                  className="w-24 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-forest/30"
                />
                <span className="text-sm text-slate">% 환불</span>
              </div>
            </div>
            <div className={rowCls()}>
              <label className={labelCls()}>1/3 미만 수강 시</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.refundBefore1Third}
                  onChange={(e) => setNum("refundBefore1Third", e.target.value)}
                  className="w-24 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-forest/30"
                />
                <span className="text-sm text-slate">% 환불</span>
              </div>
            </div>
            <div className={rowCls()}>
              <label className={labelCls()}>1/3 이상 ~ 1/2 미만</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.refundBefore1Half}
                  onChange={(e) => setNum("refundBefore1Half", e.target.value)}
                  className="w-24 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-forest/30"
                />
                <span className="text-sm text-slate">% 환불</span>
              </div>
            </div>
            <div className={rowCls()}>
              <label className={labelCls()}>1/2 이상 수강 후</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.refundAfter1Half}
                  onChange={(e) => setNum("refundAfter1Half", e.target.value)}
                  className="w-24 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-forest/30"
                />
                <span className="text-sm text-slate">% 환불</span>
              </div>
            </div>
            <div className="px-6 py-3 bg-amber-50/50">
              <p className="text-xs text-amber-700">
                ※ 학원의 설립·운영 및 과외교습에 관한 법률 시행령 기준.
                법정 기준보다 불리하게 설정할 수 없습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 저장 버튼 */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ink px-7 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
