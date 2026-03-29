"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AcademySettingsRow } from "./page";

type Props = {
  initialSettings: AcademySettingsRow;
};

// ─── 섹션별 필드 그룹 ──────────────────────────────────────────────────────────

type FieldKey = keyof AcademySettingsRow;

type FieldConfig = {
  key: FieldKey;
  label: string;
  placeholder: string;
  note?: string;
};

const BASIC_FIELDS: FieldConfig[] = [
  { key: "name", label: "학원명 *", placeholder: "예: academy-ops 강남 캠퍼스" },
  { key: "directorName", label: "원장명", placeholder: "예: 홍길동" },
  { key: "address", label: "주소", placeholder: "예: 서울특별시 강남구 테헤란로 123" },
  { key: "phone", label: "대표 전화", placeholder: "예: 02-555-1234" },
  { key: "faxNumber", label: "팩스번호", placeholder: "예: 053-241-0113" },
  { key: "websiteUrl", label: "홈페이지 URL", placeholder: "예: https://www.example.com" },
];

const TAX_FIELDS: FieldConfig[] = [
  { key: "businessRegNo", label: "사업자등록번호", placeholder: "예: 123-45-67890" },
  { key: "academyRegNo", label: "학원등록번호", placeholder: "예: 제2024-대구중구-001호" },
];

const BANK_FIELDS: FieldConfig[] = [
  { key: "bankName", label: "은행명", placeholder: "예: 농협은행" },
  { key: "bankAccount", label: "계좌번호", placeholder: "예: 123-4567-8901-23" },
  { key: "bankHolder", label: "예금주", placeholder: "예: academy-ops 강남 캠퍼스" },
];

const DOCUMENT_FIELDS: FieldConfig[] = [
  {
    key: "documentIssuer",
    label: "발급 담당자",
    placeholder: "예: 교무처장 홍길동",
    note: "서류 발급 시 담당자로 표기됩니다.",
  },
  {
    key: "sealImagePath",
    label: "직인 이미지 경로",
    placeholder: "예: /images/seal.png",
    note: "학원 직인 이미지는 서버에 직접 업로드 후 경로를 설정하세요. (미설정 시 텍스트 직인 표시)",
  },
  {
    key: "logoImagePath",
    label: "로고 이미지 경로",
    placeholder: "예: /images/logo.png",
    note: "학원 로고 이미지 경로를 입력하세요. (미설정 시 학원명 텍스트 표시)",
  },
];

// ─── 섹션 컴포넌트 ─────────────────────────────────────────────────────────────

function FieldGroup({
  title,
  fields,
  form,
  onChange,
}: {
  title: string;
  fields: FieldConfig[];
  form: AcademySettingsRow;
  onChange: (key: FieldKey, value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
        {title}
      </p>
      <div className="overflow-hidden rounded-[24px] border border-ink/10">
        <div className="divide-y divide-ink/10">
          {fields.map(({ key, label, placeholder, note }) => (
            <div key={key} className="px-6 py-4">
              <div className="flex items-center gap-4">
                <label className="w-40 shrink-0 text-xs font-semibold text-slate">
                  {label}
                </label>
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => onChange(key, e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
                />
              </div>
              {note && (
                <p className="mt-1.5 pl-44 text-xs text-slate/70">{note}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 메인 폼 ───────────────────────────────────────────────────────────────────

export function AcademySettingsForm({ initialSettings }: Props) {
  const [form, setForm] = useState<AcademySettingsRow>(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(key: FieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("학원명을 입력해주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/settings/academy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "저장 실패");
        return;
      }
      toast.success("저장되었습니다.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <FieldGroup
        title="학원 기본 정보"
        fields={BASIC_FIELDS}
        form={form}
        onChange={handleChange}
      />

      <FieldGroup
        title="사업자 정보"
        fields={TAX_FIELDS}
        form={form}
        onChange={handleChange}
      />

      <FieldGroup
        title="계좌 정보"
        fields={BANK_FIELDS}
        form={form}
        onChange={handleChange}
      />

      <FieldGroup
        title="문서 발급 설정"
        fields={DOCUMENT_FIELDS}
        form={form}
        onChange={handleChange}
      />

      {/* 직인 미리보기 */}
      {form.sealImagePath && (
        <div className="rounded-[20px] border border-ink/10 bg-mist px-6 py-4">
          <p className="mb-2 text-xs font-semibold text-slate">직인 미리보기</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={form.sealImagePath}
            alt="직인 이미지"
            className="h-20 w-20 rounded-full border-2 border-ember/30 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
