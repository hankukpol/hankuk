"use client";

import { CalendarDays, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EXAM_SCHEDULE_TYPES, getExamScheduleTypeLabel, type ExamScheduleTypeValue } from "@/lib/exam-schedule-meta";
import type { ExamScheduleItem } from "@/lib/services/exam-schedule.service";

type ExamScheduleManagerProps = {
  divisionSlug: string;
  initialSchedules: ExamScheduleItem[];
};

type FormState = {
  name: string;
  type: ExamScheduleTypeValue;
  examDate: string;
  description: string;
  isActive: boolean;
};

const defaultForm: FormState = {
  name: "",
  type: "WRITTEN",
  examDate: "",
  description: "",
  isActive: true,
};

function toFormState(item: ExamScheduleItem): FormState {
  return {
    name: item.name,
    type: item.type,
    examDate: item.examDate,
    description: item.description ?? "",
    isActive: item.isActive,
  };
}

function DDayBadge({ dDayValue, dDayLabel }: { dDayValue: number; dDayLabel: string }) {
  const isPast = dDayValue < 0;
  const isToday = dDayValue === 0;
  const className = isPast
    ? "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500"
    : isToday
      ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600"
      : "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600";
  return <span className={className}>{dDayLabel}</span>;
}

export function ExamScheduleManager({ divisionSlug, initialSchedules }: ExamScheduleManagerProps) {
  const [schedules, setSchedules] = useState<ExamScheduleItem[]>(initialSchedules);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setIsCreating(true);
  }

  function openEdit(item: ExamScheduleItem) {
    setIsCreating(false);
    setEditingId(item.id);
    setForm(toFormState(item));
  }

  function cancelForm() {
    setEditingId(null);
    setIsCreating(false);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("시험명을 입력해주세요.");
      return;
    }
    if (!form.examDate) {
      toast.error("날짜를 입력해주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        type: form.type,
        examDate: form.examDate,
        description: form.description.trim() || null,
        isActive: form.isActive,
      };

      if (editingId) {
        const res = await fetch(`/api/${divisionSlug}/exam-schedules/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? "저장에 실패했습니다.");
          return;
        }
        const { schedule } = await res.json();
        setSchedules((prev) => prev.map((s) => (s.id === editingId ? schedule : s)));
        toast.success("시험 일정이 수정되었습니다.");
      } else {
        const res = await fetch(`/api/${divisionSlug}/exam-schedules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? "저장에 실패했습니다.");
          return;
        }
        const { schedule } = await res.json();
        setSchedules((prev) =>
          [...prev, schedule].sort((a, b) => a.examDate.localeCompare(b.examDate)),
        );
        toast.success("시험 일정이 추가되었습니다.");
      }

      cancelForm();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(item: ExamScheduleItem) {
    const res = await fetch(`/api/${divisionSlug}/exam-schedules/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    if (!res.ok) {
      toast.error("상태 변경에 실패했습니다.");
      return;
    }
    const { schedule } = await res.json();
    setSchedules((prev) => prev.map((s) => (s.id === item.id ? schedule : s)));
    toast.success(schedule.isActive ? "활성화되었습니다." : "비활성화되었습니다.");
  }

  async function handleDelete(item: ExamScheduleItem) {
    if (!confirm(`"${item.name}" 일정을 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/${divisionSlug}/exam-schedules/${item.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("삭제에 실패했습니다.");
      return;
    }
    setSchedules((prev) => prev.filter((s) => s.id !== item.id));
    toast.success("삭제되었습니다.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          총 <strong>{schedules.length}</strong>개 일정 (활성:{" "}
          <strong>{schedules.filter((s) => s.isActive).length}</strong>개)
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition"
        >
          <Plus className="h-4 w-4" />
          일정 추가
        </button>
      </div>

      {(isCreating || editingId) && (
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900">
            {editingId ? "일정 수정" : "새 일정 추가"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-700">시험명 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: 2026 경찰공채 1차 필기"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">시험 종류 *</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ExamScheduleTypeValue }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {EXAM_SCHEDULE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">시험 날짜 *</label>
              <input
                type="date"
                value={form.examDate}
                onChange={(e) => setForm((f) => ({ ...f, examDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">메모 (선택)</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="선택 사항"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            활성화 (학생 포털에 D-Day 표시)
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              <X className="h-4 w-4" />
              취소
            </button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <CalendarDays className="h-10 w-10" />
          <p className="text-sm">등록된 시험 일정이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-4 rounded-[10px] border p-4 ${
                item.isActive ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900 text-sm">{item.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {getExamScheduleTypeLabel(item.type)}
                  </span>
                  {item.isActive && (
                    <DDayBadge dDayValue={item.dDayValue} dDayLabel={item.dDayLabel} />
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.examDate}
                  {item.description && ` · ${item.description}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleActive(item)}
                  title={item.isActive ? "비활성화" : "활성화"}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    item.isActive
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {item.isActive ? "활성" : "비활성"}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition"
                  title="수정"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="rounded-lg p-2 text-red-400 hover:bg-red-50 transition"
                  title="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
