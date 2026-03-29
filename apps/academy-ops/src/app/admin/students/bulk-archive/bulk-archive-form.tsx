"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type StudentRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  lastEnrollmentEnd: string | null; // ISO string or null
  activeEnrollmentCount: number;
};

type Props = {
  students: StudentRow[];
  status: "inactive_candidates" | "already_inactive";
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BulkArchiveForm({ students, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(students.map((s) => s.examNumber)));
    } else {
      setSelected(new Set());
    }
  }

  function toggleOne(examNumber: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(examNumber);
      } else {
        next.delete(examNumber);
      }
      return next;
    });
  }

  const allChecked = students.length > 0 && selected.size === students.length;
  const someChecked = selected.size > 0 && selected.size < students.length;

  async function handleDeactivate() {
    if (selected.size === 0) return;
    const confirmed = window.confirm(
      `선택한 ${selected.size}명의 학생을 비활성화하시겠습니까?`
    );
    if (!confirmed) return;

    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/students/bulk-toggle-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examNumbers: Array.from(selected),
            isActive: false,
          }),
        });
        const json = (await res.json()) as
          | { data: { updated: number } }
          | { error: string };
        if (!res.ok || "error" in json) {
          setError(
            "error" in json ? json.error : "비활성화 처리 중 오류가 발생했습니다."
          );
          return;
        }
        setResult(json.data);
        setSelected(new Set());
        router.refresh();
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      }
    });
  }

  async function handleReactivate() {
    if (selected.size === 0) return;
    const confirmed = window.confirm(
      `선택한 ${selected.size}명의 학생을 다시 활성화하시겠습니까?`
    );
    if (!confirmed) return;

    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/students/bulk-toggle-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examNumbers: Array.from(selected),
            isActive: true,
          }),
        });
        const json = (await res.json()) as
          | { data: { updated: number } }
          | { error: string };
        if (!res.ok || "error" in json) {
          setError(
            "error" in json ? json.error : "활성화 처리 중 오류가 발생했습니다."
          );
          return;
        }
        setResult(json.data);
        setSelected(new Set());
        router.refresh();
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      {students.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate">
            {selected.size > 0 ? (
              <span className="font-medium text-ink">{selected.size}명 선택됨</span>
            ) : (
              `${students.length}명 표시 중`
            )}
          </p>
          <div className="flex items-center gap-2">
            {status === "inactive_candidates" ? (
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={selected.size === 0 || isPending}
                className="rounded-full bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "처리 중..." : `선택 비활성화 (${selected.size}명)`}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={selected.size === 0 || isPending}
                className="rounded-full bg-forest px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "처리 중..." : `선택 재활성화 (${selected.size}명)`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Feedback */}
      {result && (
        <div className="rounded-[16px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {result.updated}명의 학생 상태가 업데이트되었습니다.
        </div>
      )}
      {error && (
        <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-forest/5">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-ink/30 accent-forest"
                  aria-label="전체 선택"
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-forest">학번</th>
              <th className="px-4 py-3 text-left font-semibold text-forest">이름</th>
              <th className="px-4 py-3 text-left font-semibold text-forest">연락처</th>
              <th className="px-4 py-3 text-center font-semibold text-forest">상태</th>
              <th className="px-4 py-3 text-right font-semibold text-forest">마지막 수강 종료</th>
              <th className="px-4 py-3 text-right font-semibold text-forest">활성 수강</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {students.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate">
                  해당하는 학생이 없습니다.
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.examNumber} className="transition-colors hover:bg-mist/50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(student.examNumber)}
                      onChange={(e) => toggleOne(student.examNumber, e.target.checked)}
                      className="h-4 w-4 rounded border-ink/30 accent-forest"
                      aria-label={`${student.name} 선택`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate">
                    <Link
                      href={`/admin/students/${student.examNumber}`}
                      className="font-medium text-ink underline-offset-2 transition hover:text-forest hover:underline"
                    >
                      {student.examNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      href={`/admin/students/${student.examNumber}`}
                      className="underline-offset-2 transition hover:text-forest hover:underline"
                    >
                      {student.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {student.phone ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {student.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-medium text-slate">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate">
                    {formatDate(student.lastEnrollmentEnd)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {student.activeEnrollmentCount === 0 ? (
                      <span className="text-slate">없음</span>
                    ) : (
                      <span className="font-medium text-green-700">
                        {student.activeEnrollmentCount}건
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
