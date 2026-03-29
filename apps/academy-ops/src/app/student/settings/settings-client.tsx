"use client";

import { useState, useTransition } from "react";
import type { ExamType } from "@prisma/client";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

type StudentSettings = {
  examNumber: string;
  name: string;
  mobile: string | null;
  email: string | null;
  birthDate: string | null;
  notificationConsent: boolean;
  consentedAt: Date | null;
  registeredAt: Date | null;
  examType: ExamType;
  className: string | null;
  generation: number | null;
};

type Props = {
  student: StudentSettings;
};

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "-";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatMobile(value: string | null): string {
  if (!value) {
    return "-";
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value;
}

export function SettingsClient({ student }: Props) {
  const [notificationConsent, setNotificationConsent] = useState(student.notificationConsent);
  const [notifSaveStatus, setNotifSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [phoneInput, setPhoneInput] = useState(student.mobile ?? "");
  const [emailInput, setEmailInput] = useState(student.email ?? "");
  const [currentMobile, setCurrentMobile] = useState(student.mobile);
  const [currentEmail, setCurrentEmail] = useState(student.email);
  const [contactStatus, setContactStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [contactError, setContactError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  function handleNotificationToggle() {
    const next = !notificationConsent;
    setNotificationConsent(next);
    setNotifSaveStatus("saving");

    startTransition(async () => {
      try {
        const res = await fetch("/api/student/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationConsent: next }),
        });

        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          setNotificationConsent(!next);
          setNotifSaveStatus("error");
          setContactError(json?.error ?? null);
          return;
        }

        setNotifSaveStatus("saved");
        setTimeout(() => setNotifSaveStatus("idle"), 2000);
      } catch {
        setNotificationConsent(!next);
        setNotifSaveStatus("error");
      }
    });
  }

  function handleContactSave(event: React.FormEvent) {
    event.preventDefault();
    setContactError(null);
    setContactStatus("saving");

    startTransition(async () => {
      try {
        const res = await fetch("/api/student/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: phoneInput,
            email: emailInput,
          }),
        });

        const json = (await res.json()) as {
          data?: { mobile?: string | null; email?: string | null };
          error?: string;
        };

        if (!res.ok || !json.data) {
          setContactStatus("error");
          setContactError(json.error ?? "연락처 저장에 실패했습니다.");
          return;
        }

        setCurrentMobile(json.data.mobile ?? null);
        setCurrentEmail(json.data.email ?? null);
        setPhoneInput(json.data.mobile ?? "");
        setEmailInput(json.data.email ?? "");
        setContactStatus("saved");
        setTimeout(() => setContactStatus("idle"), 2000);
      } catch {
        setContactStatus("error");
        setContactError("네트워크 오류로 연락처를 저장하지 못했습니다.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/10 text-forest">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">기본 정보</h2>
        </div>

        <dl className="grid gap-3 rounded-[24px] border border-ink/10 p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">이름</dt>
            <dd className="mt-1 font-semibold text-ink">{student.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">학번</dt>
            <dd className="mt-1 font-semibold text-ember">{student.examNumber}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">연락처</dt>
            <dd className="mt-1 text-ink">{formatMobile(currentMobile)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">이메일</dt>
            <dd className="mt-1 text-ink">{currentEmail ?? "미등록"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">생년월일</dt>
            <dd className="mt-1 text-ink">{formatDate(student.birthDate)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">직렬</dt>
            <dd className="mt-1 text-ink">{EXAM_TYPE_LABEL[student.examType]}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">반</dt>
            <dd className="mt-1 text-ink">{student.className ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">기수</dt>
            <dd className="mt-1 text-ink">{student.generation ? `${student.generation}기` : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">등록일</dt>
            <dd className="mt-1 text-ink">{formatDate(student.registeredAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ember/10 text-ember">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 0 1 4 2.5h12A1.5 1.5 0 0 1 17.5 4v12A1.5 1.5 0 0 1 16 17.5H4A1.5 1.5 0 0 1 2.5 16V4Zm2.56.5a.75.75 0 0 0-.53 1.28l4.94 4.94a.75.75 0 0 0 1.06 0l4.94-4.94a.75.75 0 1 0-1.06-1.06L10 9.19 6.12 5.22a.747.747 0 0 0-1.06 0Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">연락 수단</h2>
            <p className="text-sm text-slate">영수증과 주요 안내를 받을 연락처를 관리합니다.</p>
          </div>
        </div>

        <form onSubmit={handleContactSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate">휴대폰</span>
              <input
                type="tel"
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="010-0000-0000"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none transition focus:border-ember/40"
                disabled={isPending}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate">이메일</span>
              <input
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="receipts@example.com"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none transition focus:border-ember/40"
                disabled={isPending}
              />
            </label>
          </div>

          {contactError ? <p className="text-sm text-red-600">{contactError}</p> : null}
          {contactStatus === "saved" ? <p className="text-sm text-forest">연락처 정보가 저장되었습니다.</p> : null}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {contactStatus === "saving" ? "저장 중..." : "연락처 저장"}
          </button>
        </form>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/10 text-forest">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M4 8a6 6 0 1 1 12 0v3.528l1.64 2.46A1 1 0 0 1 16.8 15.6H14a4 4 0 0 1-8 0H3.2a1 1 0 0 1-.84-1.61L4 11.528V8Zm4 9.4a2 2 0 0 0 4 0H8Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">알림 설정</h2>
            <p className="text-sm text-slate">카카오 알림톡과 문자 발송 동의를 관리합니다.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-ink/10">
          <button
            type="button"
            onClick={handleNotificationToggle}
            disabled={isPending}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-mist/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div>
              <p className="text-sm font-semibold">전체 알림 수신 동의</p>
              <p className="mt-0.5 text-xs text-slate">수납 안내, 성적 공지, 공지사항 안내를 받습니다.</p>
            </div>
            <span
              className={`relative inline-flex h-6 w-11 rounded-full transition ${notificationConsent ? "bg-ember" : "bg-ink/20"}`}
              aria-hidden="true"
            >
              <span
                className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${notificationConsent ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </span>
          </button>
        </div>

        {student.consentedAt && notificationConsent ? (
          <p className="mt-3 text-xs text-slate">최근 동의일: {formatDate(student.consentedAt)}</p>
        ) : null}
        {notifSaveStatus === "saving" ? <p className="mt-3 text-xs text-slate">저장 중...</p> : null}
        {notifSaveStatus === "saved" ? <p className="mt-3 text-xs text-forest">알림 설정이 저장되었습니다.</p> : null}
        {notifSaveStatus === "error" ? (
          <p className="mt-3 text-xs text-red-600">알림 설정 저장에 실패했습니다. 다시 시도해 주세요.</p>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate/10 text-slate">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">로그인 안내</h2>
            <p className="text-sm text-slate">학생 포털은 학번과 생년월일 6자리로 로그인합니다.</p>
          </div>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-mist/60 px-4 py-4 text-sm leading-6 text-slate">
          이름, 학번, 직렬 변경이 필요하면 학원 창구로 문의해 주세요. 연락처와 이메일은 이 화면에서 직접 수정할 수 있습니다.
        </div>
      </section>
    </div>
  );
}
