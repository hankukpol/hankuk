"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";

type InstructorEditData = {
  id: string;
  name: string;
  subject: string;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  isActive: boolean;
};

type Props = {
  instructor: InstructorEditData;
};

export function InstructorEditForm({ instructor }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(instructor.name);
  const [subject, setSubject] = useState(instructor.subject);
  const [phone, setPhone] = useState(instructor.phone ?? "");
  const [email, setEmail] = useState(instructor.email ?? "");
  const [bankName, setBankName] = useState(instructor.bankName ?? "");
  const [bankAccount, setBankAccount] = useState(instructor.bankAccount ?? "");
  const [bankHolder, setBankHolder] = useState(instructor.bankHolder ?? "");
  const [isActive, setIsActive] = useState(instructor.isActive);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("강사명을 입력하세요.");
      return;
    }
    if (!subject.trim()) {
      setError("담당 과목을 입력하세요.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/instructors/${instructor.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            subject: subject.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            bankName: bankName.trim() || null,
            bankAccount: bankAccount.trim() || null,
            bankHolder: bankHolder.trim() || null,
            isActive,
          }),
          cache: "no-store",
        });

        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "수정 실패");

        router.push(`/admin/settings/instructors/${instructor.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      {/* Basic info */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">기본 정보</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {/* 이름 */}
          <div>
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="instructor-edit-name"
            >
              강사명 <span className="text-red-500">*</span>
            </label>
            <input
              id="instructor-edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="강사 이름"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>

          {/* 담당 과목 */}
          <div>
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="instructor-edit-subject"
            >
              담당 과목 <span className="text-red-500">*</span>
            </label>
            <input
              id="instructor-edit-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="예: 형사법, 경찰학개론"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>

          {/* 연락처 */}
          <div>
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="instructor-edit-phone"
            >
              연락처
            </label>
            <input
              id="instructor-edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>

          {/* 이메일 */}
          <div>
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="instructor-edit-email"
            >
              이메일
            </label>
            <input
              id="instructor-edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>

          {/* 재직 상태 */}
          <div className="flex flex-col justify-end">
            <label className="block text-xs font-medium text-slate">재직 상태</label>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              className={`mt-1.5 flex w-fit items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "border-[#1F4D3A]/30 bg-[#1F4D3A]/10 text-[#1F4D3A]"
                  : "border-ink/15 bg-mist/40 text-slate"
              }`}
            >
              <span
                className={`inline-block h-4 w-7 rounded-full transition-colors ${
                  isActive ? "bg-[#1F4D3A]" : "bg-slate/30"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    isActive ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </span>
              {isActive ? "재직중" : "퇴직"}
            </button>
          </div>
        </div>
      </div>

      {/* Bank info */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">정산 계좌 정보</h2>
        <p className="mt-1 text-xs text-slate">강사 정산 지급 시 사용되는 계좌 정보입니다.</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {/* 은행명 */}
          <div>
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="instructor-edit-bankName"
            >
              은행
            </label>
            <input
              id="instructor-edit-bankName"
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="예: 국민은행"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>

          {/* 예금주 */}
          <div>
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="instructor-edit-bankHolder"
            >
              예금주
            </label>
            <input
              id="instructor-edit-bankHolder"
              type="text"
              value={bankHolder}
              onChange={(e) => setBankHolder(e.target.value)}
              placeholder="예금주명"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>

          {/* 계좌번호 */}
          <div className="sm:col-span-2">
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="instructor-edit-bankAccount"
            >
              계좌번호
            </label>
            <input
              id="instructor-edit-bankAccount"
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="000-0000-0000-00"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 font-mono text-sm text-ink placeholder:font-sans placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href={`/admin/settings/instructors/${instructor.id}`}
          className="rounded-full border border-ink/20 px-5 py-2 text-sm text-slate transition hover:bg-mist"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-[#C55A11] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
