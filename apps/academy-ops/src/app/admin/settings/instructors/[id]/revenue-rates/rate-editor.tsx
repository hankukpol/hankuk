"use client";

import { useState, useTransition } from "react";

type SubjectRow = {
  id: string;
  subjectName: string;
  lectureName: string;
  lectureId: string;
  currentRate: number;
  price: number;
};

type Props = {
  subjects: SubjectRow[];
  instructorId: string;
};

export function RateEditor({ subjects, instructorId }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [rows, setRows] = useState<SubjectRow[]>(subjects);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  function startEdit(row: SubjectRow) {
    setEditingId(row.id);
    setEditValue(row.currentRate);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  function saveEdit(subjectId: string) {
    if (editValue < 0 || editValue > 100) {
      setError("배분율은 0~100 사이 정수여야 합니다.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/settings/instructors/${instructorId}/lecture-subjects/${subjectId}/rate`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instructorRate: editValue }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "저장에 실패했습니다.");
          return;
        }
        // Update local state
        setRows((prev) =>
          prev.map((r) =>
            r.id === subjectId ? { ...r, currentRate: editValue } : r,
          ),
        );
        setEditingId(null);
        setSuccessId(subjectId);
        setTimeout(() => setSuccessId(null), 2000);
        setError(null);
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
        담당 특강 과목이 없습니다.
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-[20px] border border-ink/10">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist/80 text-left">
            <tr>
              <th className="px-5 py-3.5 font-semibold">특강명</th>
              <th className="px-5 py-3.5 font-semibold">과목명</th>
              <th className="px-5 py-3.5 font-semibold text-right">수강료</th>
              <th className="px-5 py-3.5 font-semibold text-center">배분율 (%)</th>
              <th className="px-5 py-3.5 font-semibold text-right">예상 금액</th>
              <th className="px-5 py-3.5 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10 bg-white">
            {rows.map((row) => {
              const isEditing = editingId === row.id;
              const isSuccess = successId === row.id;
              const estimatedAmount = Math.floor(
                (row.price * (isEditing ? editValue : row.currentRate)) / 100,
              );

              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${isSuccess ? "bg-green-50" : "hover:bg-mist/30"}`}
                >
                  <td className="px-5 py-3.5">
                    <a
                      href={`/admin/special-lectures/${row.lectureId}`}
                      className="font-medium text-ink hover:text-ember transition-colors"
                    >
                      {row.lectureName}
                    </a>
                  </td>
                  <td className="px-5 py-3.5 text-slate">{row.subjectName}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-slate">
                    {row.price.toLocaleString()}원
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editValue}
                        onChange={(e) => setEditValue(Number(e.target.value))}
                        className="w-20 rounded-lg border border-ember/50 px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(row.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-3 py-0.5 text-xs font-semibold ${
                          isSuccess
                            ? "border border-forest/20 bg-forest/10 text-forest"
                            : "border border-ink/10 bg-mist text-ink"
                        }`}
                      >
                        {row.currentRate}%
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-slate">
                    {estimatedAmount.toLocaleString()}원
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => saveEdit(row.id)}
                          disabled={isPending}
                          className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember/90 disabled:opacity-50"
                        >
                          {isPending ? "저장 중..." : "저장"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs text-slate hover:text-ink"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(row)}
                        className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs text-slate hover:border-ember/30 hover:text-ember transition-colors"
                      >
                        수정
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
