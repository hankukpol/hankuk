"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AcademyOption = {
  id: number;
  name: string;
};

type AcademySwitcherProps = {
  academies: AcademyOption[];
  activeAcademyId: number | null;
};

export function AcademySwitcher({ academies, activeAcademyId }: AcademySwitcherProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleChange(value: string) {
    startTransition(async () => {
      setError(null);

      const academyId = value === "all" ? null : Number.parseInt(value, 10);
      const response = await fetch("/api/admin/switch-academy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "지점 전환에 실패했습니다." }));
        setError(typeof data?.error === "string" ? data.error : "지점 전환에 실패했습니다.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="sr-only" htmlFor="academy-switcher">
        지점 전환
      </label>
      <select
        id="academy-switcher"
        className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white outline-none transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        value={activeAcademyId === null ? "all" : String(activeAcademyId)}
        disabled={isPending}
        onChange={(event) => void handleChange(event.target.value)}
      >
        <option value="all">전체 지점</option>
        {academies.map((academy) => (
          <option key={academy.id} value={academy.id}>
            {academy.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-[10px] text-red-300">{error}</p> : null}
    </div>
  );
}
