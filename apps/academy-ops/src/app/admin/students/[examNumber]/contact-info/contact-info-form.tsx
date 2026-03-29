"use client";

import { useState, useTransition } from "react";

type Props = {
  examNumber: string;
  initialPhone: string | null;
  initialBirthDate: string | null;
  name: string;
  examType: string;
  studentType: string;
  generation: number | null;
  className: string | null;
  onlineId: string | null;
  registeredAt: string | null;
  note: string | null;
};

export function ContactInfoForm({
  examNumber,
  initialPhone,
  initialBirthDate,
  name,
  examType,
  studentType,
  generation,
  className,
  onlineId,
  registeredAt,
  note,
}: Props) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [birthDate, setBirthDate] = useState(initialBirthDate ?? "");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const res = await fetch(`/api/students/${examNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examNumber,
          name,
          phone: phone || null,
          birthDate: birthDate || null,
          examType,
          studentType,
          generation: generation ?? "",
          className: className ?? "",
          onlineId: onlineId ?? "",
          registeredAt: registeredAt ?? "",
          note: note ?? "",
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "연락처 저장에 실패했습니다.");
        return;
      }

      setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {success ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          기본 연락처 정보가 저장되었습니다.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">연락처 (휴대폰)</label>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="010-0000-0000"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">생년월일</label>
        <input
          type="date"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "기본 정보 저장"}
        </button>
      </div>
    </form>
  );
}
