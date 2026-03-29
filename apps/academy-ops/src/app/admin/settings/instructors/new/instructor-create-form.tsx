"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface FormState {
  name: string;
  subject: string;
  phone: string;
  email: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  subject: "",
  phone: "",
  email: "",
  bankName: "",
  bankAccount: "",
  bankHolder: "",
};

export function InstructorCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "이름을 입력하세요.";
    if (!form.subject.trim()) return "담당 과목을 입력하세요.";
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
        const res = await fetch("/api/instructors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            subject: form.subject.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            bankName: form.bankName.trim() || null,
            bankAccount: form.bankAccount.trim() || null,
            bankHolder: form.bankHolder.trim() || null,
          }),
        });

        const payload = (await res.json()) as { instructor?: { id: string }; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "등록 실패");

        router.push(`/admin/settings/instructors/${payload.instructor!.id}`);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "등록 실패");
      }
    });
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest/30 disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
        {/* Form header */}
        <div className="border-b border-ink/5 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">강사 정보 입력</h2>
          <p className="mt-0.5 text-xs text-slate">
            <span className="text-red-500">*</span> 표시 항목은 필수입니다.
          </p>
        </div>

        {/* Form body */}
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          {/* 이름 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="inst-name">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              id="inst-name"
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="홍길동"
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 담당 과목 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="inst-subject">
              담당 과목 <span className="text-red-500">*</span>
            </label>
            <input
              id="inst-subject"
              type="text"
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="예: 형사법"
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 연락처 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="inst-phone">
              연락처
            </label>
            <input
              id="inst-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="010-0000-0000"
              className={inputClass}
              disabled={isPending}
            />
          </div>

          {/* 이메일 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="inst-email">
              이메일
            </label>
            <input
              id="inst-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="example@email.com"
              className={inputClass}
              disabled={isPending}
            />
          </div>

          {/* 정산 계좌 섹션 구분선 */}
          <div className="sm:col-span-2 pt-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate">
              정산 계좌
            </p>
          </div>

          {/* 은행명 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="inst-bankName">
              은행명
            </label>
            <input
              id="inst-bankName"
              type="text"
              value={form.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              placeholder="예: 국민은행"
              className={inputClass}
              disabled={isPending}
            />
          </div>

          {/* 예금주 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="inst-bankHolder">
              예금주
            </label>
            <input
              id="inst-bankHolder"
              type="text"
              value={form.bankHolder}
              onChange={(e) => set("bankHolder", e.target.value)}
              className={inputClass}
              disabled={isPending}
            />
          </div>

          {/* 계좌번호 */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate" htmlFor="inst-bankAccount">
              계좌번호
            </label>
            <input
              id="inst-bankAccount"
              type="text"
              value={form.bankAccount}
              onChange={(e) => set("bankAccount", e.target.value)}
              placeholder="000-0000-0000000"
              className={inputClass}
              disabled={isPending}
            />
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
            {isPending ? "등록 중..." : "강사 등록"}
          </button>
        </div>
      </div>
    </form>
  );
}
