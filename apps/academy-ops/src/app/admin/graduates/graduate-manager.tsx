"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PassType } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import type { GraduateRow } from "./page";

const PASS_TYPE_LABEL: Record<PassType, string> = {
  WRITTEN_PASS: "필기합격",
  FINAL_PASS: "최종합격",
  APPOINTED: "임용",
  WRITTEN_FAIL: "필기불합격",
  FINAL_FAIL: "최종불합격",
};

const PASS_TYPE_COLOR: Record<PassType, string> = {
  WRITTEN_PASS: "bg-sky-50 text-sky-700 border-sky-200",
  FINAL_PASS: "bg-forest/10 text-forest border-forest/20",
  APPOINTED: "bg-amber-50 text-amber-700 border-amber-200",
  WRITTEN_FAIL: "bg-ink/5 text-slate border-ink/10",
  FINAL_FAIL: "bg-red-50 text-red-600 border-red-200",
};

const EXAM_TYPE_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const ALL_PASS_TYPES = Object.keys(PASS_TYPE_LABEL) as PassType[];
const POSITIVE_TYPES: PassType[] = ["WRITTEN_PASS", "FINAL_PASS", "APPOINTED"];
const TAB_TYPES: Array<PassType | "ALL"> = ["ALL", "WRITTEN_PASS", "FINAL_PASS", "APPOINTED", "WRITTEN_FAIL", "FINAL_FAIL"];

interface GraduateForm {
  examNumber: string;
  examName: string;
  passType: PassType;
  writtenPassDate: string;
  finalPassDate: string;
  appointedDate: string;
  enrolledMonths: string;
  testimony: string;
  isPublic: boolean;
  note: string;
}

const EMPTY_FORM: GraduateForm = {
  examNumber: "",
  examName: "",
  passType: "WRITTEN_PASS",
  writtenPassDate: "",
  finalPassDate: "",
  appointedDate: "",
  enrolledMonths: "",
  testimony: "",
  isPublic: false,
  note: "",
};

interface Props {
  initialRecords: GraduateRow[];
}

export function GraduateManager({ initialRecords }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GraduateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GraduateRow | null>(null);
  const [form, setForm] = useState<GraduateForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<PassType | "ALL">("ALL");
  const [search, setSearch] = useState("");

  // 연도 필터
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    new Set(
      initialRecords.map((r) => {
        const d = r.finalPassDate ?? r.writtenPassDate ?? r.appointedDate;
        return d ? new Date(d).getFullYear() : null;
      }).filter(Boolean) as number[],
    ),
  ).sort((a, b) => b - a);
  if (!years.includes(currentYear)) years.unshift(currentYear);

  const [filterYear, setFilterYear] = useState<number | "ALL">("ALL");

  const displayed = initialRecords.filter((r) => {
    if (filterType !== "ALL" && r.passType !== filterType) return false;
    if (filterYear !== "ALL") {
      const d = r.finalPassDate ?? r.writtenPassDate ?? r.appointedDate;
      if (!d || new Date(d).getFullYear() !== filterYear) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.student.name.toLowerCase().includes(q) &&
        !r.examNumber.includes(q) &&
        !r.examName.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreateOpen(true);
  }

  function openEdit(r: GraduateRow) {
    setForm({
      examNumber: r.examNumber,
      examName: r.examName,
      passType: r.passType,
      writtenPassDate: r.writtenPassDate ? r.writtenPassDate.slice(0, 10) : "",
      finalPassDate: r.finalPassDate ? r.finalPassDate.slice(0, 10) : "",
      appointedDate: r.appointedDate ? r.appointedDate.slice(0, 10) : "",
      enrolledMonths: r.enrolledMonths != null ? String(r.enrolledMonths) : "",
      testimony: r.testimony ?? "",
      isPublic: r.isPublic,
      note: r.note ?? "",
    });
    setError(null);
    setEditTarget(r);
  }

  function handleCreate() {
    if (!form.examNumber || !form.examName || !form.passType) {
      setError("수험번호, 시험명, 합격 구분은 필수입니다.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/graduates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examNumber: form.examNumber.trim(),
            examName: form.examName.trim(),
            passType: form.passType,
            writtenPassDate: form.writtenPassDate || null,
            finalPassDate: form.finalPassDate || null,
            appointedDate: form.appointedDate || null,
            enrolledMonths: form.enrolledMonths ? Number(form.enrolledMonths) : null,
            testimony: form.testimony || null,
            isPublic: form.isPublic,
            note: form.note || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "등록 실패");
        setCreateOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "등록 실패");
      }
    });
  }

  function handleEdit() {
    if (!editTarget || !form.examName || !form.passType) {
      setError("시험명과 합격 구분은 필수입니다.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/graduates/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examName: form.examName.trim(),
            passType: form.passType,
            writtenPassDate: form.writtenPassDate || null,
            finalPassDate: form.finalPassDate || null,
            appointedDate: form.appointedDate || null,
            enrolledMonths: form.enrolledMonths ? Number(form.enrolledMonths) : null,
            testimony: form.testimony || null,
            isPublic: form.isPublic,
            note: form.note || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setEditTarget(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await fetch(`/api/graduates/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름·수험번호·시험명 검색"
          className="rounded-[12px] border border-ink/20 px-4 py-2 text-sm outline-none focus:border-forest w-56"
        />

        {/* 연도 필터 */}
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
          className="rounded-[12px] border border-ink/20 px-3 py-2 text-sm outline-none focus:border-forest"
        >
          <option value="ALL">전체 연도</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>

        {/* 합격 구분 탭 */}
        <div className="flex flex-wrap gap-1">
          {TAB_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filterType === t ? "bg-ink text-white" : "border border-ink/20 text-slate hover:border-ink/40"
              }`}
            >
              {t === "ALL" ? "전체" : PASS_TYPE_LABEL[t as PassType]}
            </button>
          ))}
        </div>

        <button
          onClick={openCreate}
          className="ml-auto rounded-[28px] bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest transition-colors"
        >
          + 합격 등록
        </button>
      </div>

      {/* 결과 수 */}
      <p className="text-xs text-slate mb-3">
        {displayed.length}건
        {filterYear !== "ALL" && ` · ${filterYear}년`}
        {filterType !== "ALL" && ` · ${PASS_TYPE_LABEL[filterType as PassType]}`}
      </p>

      {/* Table */}
      {displayed.length === 0 ? (
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 py-12 text-center text-slate text-sm">
          합격자 기록이 없습니다.
        </div>
      ) : (
        <div className="rounded-[20px] border border-ink/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-mist border-b border-ink/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">학생</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">시험명</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">합격 구분</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">수험 유형</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">합격일</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">수강 기간</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">성적 스냅샷</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {displayed.map((r) => (
                <tr key={r.id} className="hover:bg-mist/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/students/${r.examNumber}`}
                      className="font-medium hover:text-forest transition-colors"
                    >
                      {r.student.name}
                    </Link>
                    <p className="text-xs text-slate">
                      {r.examNumber}
                      {r.student.generation ? ` · ${r.student.generation}기` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate">{r.examName}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PASS_TYPE_COLOR[r.passType]}`}>
                      {PASS_TYPE_LABEL[r.passType]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate">
                    {EXAM_TYPE_LABEL[r.student.examType] ?? r.student.examType}
                  </td>
                  <td className="px-4 py-3 text-slate text-xs">
                    {r.finalPassDate
                      ? new Date(r.finalPassDate).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })
                      : r.writtenPassDate
                      ? new Date(r.writtenPassDate).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-center text-slate text-xs">
                    {r.enrolledMonths != null ? `${r.enrolledMonths}개월` : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.scoreSnapshots.length > 0 ? (
                      <div className="flex flex-wrap justify-center gap-1">
                        {r.scoreSnapshots
                          .filter((s) => POSITIVE_TYPES.includes(s.snapshotType))
                          .map((s) => (
                            <span
                              key={s.snapshotType}
                              className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] text-forest font-medium"
                            >
                              {PASS_TYPE_LABEL[s.snapshotType]}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate/50">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/graduates/${r.id}`}
                        className="text-xs text-forest font-medium hover:underline"
                      >
                        상세
                      </Link>
                      <button
                        onClick={() => openEdit(r)}
                        className="text-xs text-slate hover:text-ink"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => {
                          setError(null);
                          setDeleteTarget(r);
                        }}
                        className="text-xs text-red-400 hover:text-red-600"
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

      {/* Create Modal */}
      <ActionModal
        open={createOpen}
        badgeLabel="합격자 관리"
        title="합격 등록"
        description="합격자 정보를 등록합니다."
        confirmLabel="등록"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        panelClassName="max-w-lg"
      >
        <GraduateFormFields form={form} onChange={setForm} error={error} showExamNumber />
      </ActionModal>

      {/* Edit Modal */}
      <ActionModal
        open={!!editTarget}
        badgeLabel="합격자 관리"
        title="합격 정보 수정"
        description={`"${editTarget?.student?.name}" 합격 기록을 수정합니다.`}
        confirmLabel="저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEdit}
        panelClassName="max-w-lg"
      >
        <GraduateFormFields form={form} onChange={setForm} error={error} />
      </ActionModal>

      {/* Delete Modal */}
      <ActionModal
        open={!!deleteTarget}
        badgeLabel="합격자 관리"
        badgeTone="warning"
        title="합격 기록 삭제"
        description={`"${deleteTarget?.student?.name}" 합격 기록을 삭제합니다. 연결된 성적 스냅샷도 함께 삭제됩니다.`}
        confirmLabel="삭제"
        confirmTone="danger"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function GraduateFormFields({
  form,
  onChange,
  error,
  showExamNumber = false,
}: {
  form: GraduateForm;
  onChange: (f: GraduateForm) => void;
  error: string | null;
  showExamNumber?: boolean;
}) {
  return (
    <div className="space-y-3 pt-2">
      {error && <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {showExamNumber && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">수험번호 *</label>
          <input
            type="text"
            value={form.examNumber}
            onChange={(e) => onChange({ ...form, examNumber: e.target.value })}
            placeholder="예: 202600001"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate">시험명 *</label>
        <input
          type="text"
          value={form.examName}
          onChange={(e) => onChange({ ...form, examName: e.target.value })}
          placeholder="예: 2026 경찰공무원(순경) 공채"
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate">합격 구분 *</label>
        <select
          value={form.passType}
          onChange={(e) => onChange({ ...form, passType: e.target.value as PassType })}
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
        >
          {ALL_PASS_TYPES.map((k) => (
            <option key={k} value={k}>
              {PASS_TYPE_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">필기 합격일</label>
          <input
            type="date"
            value={form.writtenPassDate}
            onChange={(e) => onChange({ ...form, writtenPassDate: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">최종 합격일</label>
          <input
            type="date"
            value={form.finalPassDate}
            onChange={(e) => onChange({ ...form, finalPassDate: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">임용일</label>
          <input
            type="date"
            value={form.appointedDate}
            onChange={(e) => onChange({ ...form, appointedDate: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">수강 기간 (개월)</label>
          <input
            type="number"
            min="1"
            max="60"
            value={form.enrolledMonths}
            onChange={(e) => onChange({ ...form, enrolledMonths: e.target.value })}
            placeholder="예: 18"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate">합격 수기 (선택)</label>
        <textarea
          value={form.testimony}
          onChange={(e) => onChange({ ...form, testimony: e.target.value })}
          rows={3}
          placeholder="합격자의 공부 후기를 입력합니다."
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest resize-none"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate cursor-pointer">
        <input
          type="checkbox"
          checked={form.isPublic}
          onChange={(e) => onChange({ ...form, isPublic: e.target.checked })}
          className="rounded border-ink/20"
        />
        수기 공개 (학생 포털에 노출)
      </label>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate">내부 메모 (선택)</label>
        <input
          type="text"
          value={form.note}
          onChange={(e) => onChange({ ...form, note: e.target.value })}
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      </div>
    </div>
  );
}
