"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ExamCategory = "GONGCHAE" | "GYEONGCHAE" | "SOGANG" | "CUSTOM";
type SpecialLectureType = "THEMED" | "SINGLE" | "INTERVIEW_COACHING";

const EXAM_CATEGORY_LABEL: Record<ExamCategory, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

const LECTURE_TYPE_LABEL: Record<SpecialLectureType, string> = {
  THEMED: "테마 특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접 코칭",
};

const EXAM_CATEGORIES: ExamCategory[] = ["GONGCHAE", "GYEONGCHAE", "SOGANG", "CUSTOM"];
const LECTURE_TYPES: SpecialLectureType[] = ["SINGLE", "THEMED", "INTERVIEW_COACHING"];

interface FormState {
  name: string;
  lectureType: SpecialLectureType;
  examCategory: ExamCategory | "";
  startDate: string;
  endDate: string;
  isMultiSubject: boolean;
  fullPackagePrice: string;
  hasSeatAssignment: boolean;
  hasLive: boolean;
  hasOffline: boolean;
  maxCapacityLive: string;
  maxCapacityOffline: string;
  waitlistAllowed: boolean;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  lectureType: "SINGLE",
  examCategory: "",
  startDate: "",
  endDate: "",
  isMultiSubject: false,
  fullPackagePrice: "",
  hasSeatAssignment: false,
  hasLive: false,
  hasOffline: true,
  maxCapacityLive: "",
  maxCapacityOffline: "",
  waitlistAllowed: true,
  isActive: true,
};

export function SpecialLectureCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "강좌명을 입력하세요.";
    if (!form.lectureType) return "강좌 유형을 선택하세요.";
    if (!form.startDate) return "시작일을 입력하세요.";
    if (!form.endDate) return "종료일을 입력하세요.";
    if (form.startDate > form.endDate) return "종료일은 시작일 이후여야 합니다.";
    if (form.isMultiSubject && form.fullPackagePrice && Number(form.fullPackagePrice) < 0) {
      return "패키지 가격은 0원 이상이어야 합니다.";
    }
    if (form.maxCapacityOffline && Number(form.maxCapacityOffline) < 1) {
      return "오프라인 정원은 1명 이상이어야 합니다.";
    }
    if (form.maxCapacityLive && Number(form.maxCapacityLive) < 1) {
      return "라이브 정원은 1명 이상이어야 합니다.";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const error = validate();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/special-lectures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            lectureType: form.lectureType,
            examCategory: form.examCategory || null,
            startDate: form.startDate,
            endDate: form.endDate,
            isMultiSubject: form.isMultiSubject,
            fullPackagePrice:
              form.isMultiSubject && form.fullPackagePrice
                ? Number(form.fullPackagePrice)
                : null,
            hasSeatAssignment: form.hasSeatAssignment,
            hasLive: form.hasLive,
            hasOffline: form.hasOffline,
            maxCapacityLive:
              form.hasLive && form.maxCapacityLive ? Number(form.maxCapacityLive) : null,
            maxCapacityOffline:
              form.hasOffline && form.maxCapacityOffline
                ? Number(form.maxCapacityOffline)
                : null,
            waitlistAllowed: form.waitlistAllowed,
          }),
        });

        const payload = (await res.json()) as { lecture?: { id: string }; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "등록 실패");

        router.push(`/admin/settings/special-lectures/${payload.lecture!.id}`);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "등록 실패");
      }
    });
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30 disabled:opacity-50";

  const checkboxClass = "h-4 w-4 rounded border-ink/20 text-forest focus:ring-forest/30";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
        {/* Form header */}
        <div className="border-b border-ink/5 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">특강 정보 입력</h2>
          <p className="mt-0.5 text-xs text-slate">
            <span className="text-red-500">*</span> 표시 항목은 필수입니다.
          </p>
        </div>

        {/* Form body */}
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          {/* 강좌명 */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate" htmlFor="sl-name">
              강좌명 <span className="text-red-500">*</span>
            </label>
            <input
              id="sl-name"
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="예: 2026 형사법 기초 특강"
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 강좌 유형 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="sl-lectureType">
              강좌 유형 <span className="text-red-500">*</span>
            </label>
            <select
              id="sl-lectureType"
              value={form.lectureType}
              onChange={(e) => set("lectureType", e.target.value as SpecialLectureType)}
              className={inputClass}
              disabled={isPending}
            >
              {LECTURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LECTURE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          {/* 수험 유형 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="sl-examCategory">
              수험 유형{" "}
              <span className="text-xs font-normal text-slate/60">(비워두면 공통)</span>
            </label>
            <select
              id="sl-examCategory"
              value={form.examCategory}
              onChange={(e) => set("examCategory", e.target.value as ExamCategory | "")}
              className={inputClass}
              disabled={isPending}
            >
              <option value="">공통 (전체)</option>
              {EXAM_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {EXAM_CATEGORY_LABEL[cat]}
                </option>
              ))}
            </select>
          </div>

          {/* 시작일 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="sl-startDate">
              시작일 <span className="text-red-500">*</span>
            </label>
            <input
              id="sl-startDate"
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 종료일 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="sl-endDate">
              종료일 <span className="text-red-500">*</span>
            </label>
            <input
              id="sl-endDate"
              type="date"
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 오프라인 정원 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="sl-maxCapacityOffline">
              오프라인 정원{" "}
              <span className="text-xs font-normal text-slate/60">(비워두면 무제한)</span>
            </label>
            <input
              id="sl-maxCapacityOffline"
              type="number"
              min={1}
              value={form.maxCapacityOffline}
              onChange={(e) => set("maxCapacityOffline", e.target.value)}
              placeholder="무제한"
              className={inputClass}
              disabled={isPending}
            />
          </div>

          {/* 라이브 정원 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="sl-maxCapacityLive">
              라이브 정원{" "}
              <span className="text-xs font-normal text-slate/60">(라이브 미사용 시 불필요)</span>
            </label>
            <input
              id="sl-maxCapacityLive"
              type="number"
              min={1}
              value={form.maxCapacityLive}
              onChange={(e) => set("maxCapacityLive", e.target.value)}
              placeholder="라이브 미사용"
              disabled={!form.hasLive || isPending}
              className={inputClass}
            />
          </div>

          {/* 복합 과목 + 패키지 가격 */}
          <div className="sm:col-span-2 space-y-3">
            <label className="flex items-center gap-2.5 text-sm text-slate cursor-pointer">
              <input
                type="checkbox"
                checked={form.isMultiSubject}
                onChange={(e) => set("isMultiSubject", e.target.checked)}
                className={checkboxClass}
                disabled={isPending}
              />
              복합 과목 (여러 과목 묶음)
            </label>
            {form.isMultiSubject && (
              <div>
                <label className="block text-xs font-medium text-slate" htmlFor="sl-fullPackagePrice">
                  패키지 일괄 가격{" "}
                  <span className="text-xs font-normal text-slate/60">(개별 합산 대신 적용 시)</span>
                </label>
                <input
                  id="sl-fullPackagePrice"
                  type="number"
                  min={0}
                  value={form.fullPackagePrice}
                  onChange={(e) => set("fullPackagePrice", e.target.value)}
                  placeholder="0"
                  className={inputClass}
                  disabled={isPending}
                />
              </div>
            )}
          </div>

          {/* 옵션 체크박스들 */}
          <div className="sm:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex items-center gap-2.5 text-sm text-slate cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasOffline}
                onChange={(e) => set("hasOffline", e.target.checked)}
                className={checkboxClass}
                disabled={isPending}
              />
              오프라인 지원
            </label>
            <label className="flex items-center gap-2.5 text-sm text-slate cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasLive}
                onChange={(e) => set("hasLive", e.target.checked)}
                className={checkboxClass}
                disabled={isPending}
              />
              라이브 지원
            </label>
            <label className="flex items-center gap-2.5 text-sm text-slate cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasSeatAssignment}
                onChange={(e) => set("hasSeatAssignment", e.target.checked)}
                className={checkboxClass}
                disabled={isPending}
              />
              좌석 배정
            </label>
            <label className="flex items-center gap-2.5 text-sm text-slate cursor-pointer">
              <input
                type="checkbox"
                checked={form.waitlistAllowed}
                onChange={(e) => set("waitlistAllowed", e.target.checked)}
                className={checkboxClass}
                disabled={isPending}
              />
              대기 등록 허용
            </label>
          </div>

          {/* 활성 상태 */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate">강좌 상태</label>
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              onClick={() => set("isActive", !form.isActive)}
              disabled={isPending}
              className={`mt-1.5 flex w-fit items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${
                form.isActive
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-ink/15 bg-mist/40 text-slate"
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-7 rounded-full transition-colors ${
                  form.isActive ? "bg-forest" : "bg-slate/30"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    form.isActive ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </span>
              {form.isActive ? "활성" : "비활성"}
            </button>
          </div>
        </div>

        {/* Error */}
        {formError && (
          <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {formError}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-ink/5 px-6 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPending}
            className="rounded-full border border-ink/20 px-5 py-2 text-sm text-slate transition hover:bg-mist disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[#C55A11] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "등록 중..." : "특강 등록"}
          </button>
        </div>
      </div>
    </form>
  );
}
