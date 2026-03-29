"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InstructorSubjectRow, SpecialLectureOption } from "./page";

const LECTURE_TYPE_LABEL: Record<string, string> = {
  THEMED: "주제특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접코칭",
};

type Props = {
  instructorId: string;
  instructorName: string;
  subjectRows: InstructorSubjectRow[];
  lectureOptions: SpecialLectureOption[];
};

type FormMode = "idle" | "add" | "edit";

type EditingState = {
  subjectId: string;
  lectureId: string;
  subjectName: string;
  price: string;
  instructorRate: string;
  sortOrder: string;
};

export function InstructorSubjectsClient({
  instructorId,
  subjectRows: initialRows,
  lectureOptions,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<InstructorSubjectRow[]>(initialRows);
  const [formMode, setFormMode] = useState<FormMode>("idle");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add form state
  const [addLectureId, setAddLectureId] = useState<string>("");
  const [addSubjectName, setAddSubjectName] = useState<string>("");
  const [addPrice, setAddPrice] = useState<string>("");
  const [addRate, setAddRate] = useState<string>("");
  const [addSortOrder, setAddSortOrder] = useState<string>("");

  function resetAddForm() {
    setAddLectureId("");
    setAddSubjectName("");
    setAddPrice("");
    setAddRate("");
    setAddSortOrder("");
    setErrorMsg(null);
  }

  function openEdit(row: InstructorSubjectRow) {
    setEditing({
      subjectId: row.id,
      lectureId: row.lectureId,
      subjectName: row.subjectName,
      price: String(row.price),
      instructorRate: String(row.instructorRate),
      sortOrder: String(row.sortOrder),
    });
    setFormMode("edit");
    setErrorMsg(null);
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addLectureId) {
      setErrorMsg("특강을 선택하세요.");
      return;
    }
    if (!addSubjectName.trim()) {
      setErrorMsg("과목명을 입력하세요.");
      return;
    }
    const price = Number(addPrice);
    const rate = Number(addRate);
    if (!Number.isFinite(price) || price < 0) {
      setErrorMsg("수강료를 올바르게 입력하세요.");
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setErrorMsg("배분율은 0~100 사이 숫자여야 합니다.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/special-lectures/${addLectureId}/subjects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectName: addSubjectName.trim(),
            instructorId,
            price,
            instructorRate: rate,
            sortOrder: addSortOrder ? Number(addSortOrder) : undefined,
          }),
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "등록 실패");

        const newSubject = json.subject as {
          id: string;
          lectureId: string;
          subjectName: string;
          price: number;
          instructorRate: number;
          sortOrder: number;
          instructor: { id: string; name: string };
        };

        // Find lecture info
        const lecture = lectureOptions.find((l) => l.id === addLectureId);
        if (lecture) {
          setRows((prev) => [
            ...prev,
            {
              id: newSubject.id,
              lectureId: newSubject.lectureId,
              lectureName: lecture.name,
              lectureType: lecture.lectureType,
              lectureStartDate: lecture.startDate,
              lectureEndDate: lecture.endDate,
              lectureIsActive: lecture.isActive,
              subjectName: newSubject.subjectName,
              price: newSubject.price,
              instructorRate: newSubject.instructorRate,
              sortOrder: newSubject.sortOrder,
            },
          ]);
        }

        resetAddForm();
        setFormMode("idle");
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "등록에 실패했습니다.");
      }
    });
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const price = Number(editing.price);
    const rate = Number(editing.instructorRate);
    if (!editing.subjectName.trim()) {
      setErrorMsg("과목명을 입력하세요.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setErrorMsg("수강료를 올바르게 입력하세요.");
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setErrorMsg("배분율은 0~100 사이 숫자여야 합니다.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/special-lectures/${editing.lectureId}/subjects/${editing.subjectId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subjectName: editing.subjectName.trim(),
              price,
              instructorRate: rate,
              sortOrder: editing.sortOrder ? Number(editing.sortOrder) : undefined,
            }),
            cache: "no-store",
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "수정 실패");

        setRows((prev) =>
          prev.map((r) =>
            r.id === editing.subjectId
              ? {
                  ...r,
                  subjectName: editing.subjectName.trim(),
                  price,
                  instructorRate: rate,
                  sortOrder: editing.sortOrder ? Number(editing.sortOrder) : r.sortOrder,
                }
              : r,
          ),
        );

        setEditing(null);
        setFormMode("idle");
        setErrorMsg(null);
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "수정에 실패했습니다.");
      }
    });
  }

  function handleDelete(row: InstructorSubjectRow) {
    if (!confirm(`"${row.lectureName}" — ${row.subjectName} 과목 배정을 삭제합니까?`)) return;

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/special-lectures/${row.lectureId}/subjects/${row.id}`,
          { method: "DELETE", cache: "no-store" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "삭제 실패");
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      }
    });
  }

  const activeRows = rows.filter((r) => r.lectureIsActive);
  const inactiveRows = rows.filter((r) => !r.lectureIsActive);

  return (
    <div className="space-y-6">
      {/* Summary KPI */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">전체 배정</p>
          <p className="mt-2 text-xl font-bold text-ink">{rows.length}개</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-forest">진행 중</p>
          <p className="mt-2 text-xl font-bold text-forest">{activeRows.length}개</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">종료된 강좌</p>
          <p className="mt-2 text-xl font-bold text-slate">{inactiveRows.length}개</p>
        </div>
      </div>

      {/* Add button */}
      {formMode === "idle" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setFormMode("add");
              resetAddForm();
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            <span>+</span>
            과목 배정 추가
          </button>
        </div>
      )}

      {/* Add form */}
      {formMode === "add" && (
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
          <h2 className="text-base font-semibold text-ink">새 과목 배정 추가</h2>
          <form onSubmit={handleAddSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">특강 선택 *</label>
                <select
                  value={addLectureId}
                  onChange={(e) => setAddLectureId(e.target.value)}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                  required
                >
                  <option value="">-- 특강을 선택하세요 --</option>
                  {lectureOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.isActive ? " (진행중)" : " (종료)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">과목명 *</label>
                <input
                  type="text"
                  value={addSubjectName}
                  onChange={(e) => setAddSubjectName(e.target.value)}
                  placeholder="예: 형법, 헌법"
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">수강료 (원) *</label>
                <input
                  type="number"
                  value={addPrice}
                  onChange={(e) => setAddPrice(e.target.value)}
                  placeholder="예: 150000"
                  min={0}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">강사 배분율 (%) *</label>
                <input
                  type="number"
                  value={addRate}
                  onChange={(e) => setAddRate(e.target.value)}
                  placeholder="예: 50"
                  min={0}
                  max={100}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">순서 (생략 시 자동)</label>
                <input
                  type="number"
                  value={addSortOrder}
                  onChange={(e) => setAddSortOrder(e.target.value)}
                  placeholder="0부터 시작"
                  min={0}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
              >
                {isPending ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormMode("idle");
                  resetAddForm();
                }}
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold transition hover:border-ink/30"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit form */}
      {formMode === "edit" && editing && (
        <div className="rounded-[28px] border border-ink/20 bg-mist p-6">
          <h2 className="text-base font-semibold text-ink">과목 배정 수정</h2>
          <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">과목명 *</label>
                <input
                  type="text"
                  value={editing.subjectName}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, subjectName: e.target.value } : prev)}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">수강료 (원) *</label>
                <input
                  type="number"
                  value={editing.price}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, price: e.target.value } : prev)}
                  min={0}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">강사 배분율 (%) *</label>
                <input
                  type="number"
                  value={editing.instructorRate}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, instructorRate: e.target.value } : prev)}
                  min={0}
                  max={100}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate mb-1">순서</label>
                <input
                  type="number"
                  value={editing.sortOrder}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, sortOrder: e.target.value } : prev)}
                  min={0}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:border-ember/50 focus:outline-none"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
              >
                {isPending ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormMode("idle");
                  setEditing(null);
                  setErrorMsg(null);
                }}
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold transition hover:border-ink/30"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-14 text-center text-sm text-slate">
          배정된 과목이 없습니다. 위의 &ldquo;과목 배정 추가&rdquo; 버튼을 눌러 추가하세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <table className="min-w-full divide-y divide-ink/5 text-sm">
            <thead>
              <tr>
                {["특강명", "유형", "강의 기간", "과목명", "수강료", "배분율", "상태", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`transition hover:bg-mist/20 ${!row.lectureIsActive ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                    <Link
                      href={`/admin/special-lectures/${row.lectureId}`}
                      className="hover:text-ember"
                    >
                      {row.lectureName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                    {LECTURE_TYPE_LABEL[row.lectureType] ?? row.lectureType}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                    {row.lectureStartDate.slice(0, 10)}
                    {" ~ "}
                    {row.lectureEndDate.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                    {row.subjectName}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink whitespace-nowrap">
                    {row.price.toLocaleString()}원
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink whitespace-nowrap">
                    {row.instructorRate}%
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.lectureIsActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {row.lectureIsActive ? "진행중" : "종료"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        disabled={isPending}
                        className="text-xs text-slate hover:text-ember disabled:opacity-40"
                      >
                        수정
                      </button>
                      <span className="text-ink/20">|</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={isPending}
                        className="text-xs text-slate hover:text-red-600 disabled:opacity-40"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
