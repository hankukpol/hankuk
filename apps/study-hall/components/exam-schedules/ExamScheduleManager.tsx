"use client";
import { MobileWorkspaceTools } from "@/components/ui/MobileWorkspaceTools";

import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "@/lib/sonner";

import { SlideOver } from "@/components/ui/SlideOver";
import { DialogActions } from "@/components/ui/DialogActions";
import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
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
    ? "rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500"
    : isToday
      ? "rounded-lg bg-admin-danger-soft px-2 py-1 text-xs font-semibold text-admin-danger"
      : "rounded-lg bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-600";
  return <span className={className}>{dDayLabel}</span>;
}

export function ExamScheduleManager({ divisionSlug, initialSchedules }: ExamScheduleManagerProps) {
  const [schedules, setSchedules] = useState<ExamScheduleItem[]>(initialSchedules);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [initialForm, setInitialForm] = useState(defaultForm);
  const formId = useId();
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const { confirm, confirmDialog } = useConfirmDialog();

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setInitialForm(defaultForm);
    setIsCreating(true);
  }

  function openEdit(item: ExamScheduleItem) {
    setIsCreating(false);
    setEditingId(item.id);
    setForm(toFormState(item));
    setInitialForm(toFormState(item));
  }

  function cancelForm() {
    setEditingId(null);
    setIsCreating(false);
  }

  async function closeEditor() {
    if (isSaving) return;
    if (JSON.stringify(form) !== JSON.stringify(initialForm) && !await confirm({ title: "변경사항 폐기", description: "저장하지 않은 시험 일정이 있습니다.", confirmLabel: "변경 폐기", cancelLabel: "계속 편집", variant: "warning" })) return;
    cancelForm();
  }

  async function handleSave() {
    if (isSaving) return;
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
        setSchedules((prev) => prev.map((s) => (s.id === editingId ? schedule : s)).sort((a, b) => a.examDate.localeCompare(b.examDate)));
        toast.success("시험 일정이 수정되었습니다.");
        showActionComplete({
          title: "시험 일정 수정 완료",
          description: `"${schedule.name}" 일정 변경이 저장되었습니다.`,
          notice: "수정된 시험 일정은 관리자 목록과 학생 포털 표시 화면에 바로 반영됩니다.",
        });
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
        showActionComplete({
          title: "시험 일정 등록 완료",
          description: `"${schedule.name}" 일정을 등록했습니다.`,
          notice: "새 일정은 관리자 목록과 학생 포털 D-Day 화면에 바로 반영됩니다.",
        });
      }

      cancelForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(item: ExamScheduleItem) {
    if (isSaving) return;
    const confirmed = await confirm({
      title: "시험 일정 삭제",
      description: `"${item.name}" 일정을 삭제하시겠습니까? 삭제 후에는 학생 포털 D-Day 목록에서도 함께 제거됩니다.`,
      confirmLabel: "삭제",
      cancelLabel: "취소",
      variant: "danger",
    });
    if (!confirmed) return;
    setIsSaving(true);
    try {
    const res = await fetch(`/api/${divisionSlug}/exam-schedules/${item.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("삭제에 실패했습니다.");
      return;
    }
    setSchedules((prev) => prev.filter((s) => s.id !== item.id));
    cancelForm();
    toast.success("삭제되었습니다.");
    showActionComplete({
      title: "시험 일정 삭제 완료",
      description: `"${item.name}" 일정을 삭제했습니다.`,
      notice: "삭제된 일정은 현재 목록과 학생 포털 화면에서 더 이상 보이지 않습니다.",
    });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="admin-section">
        <MobileWorkspaceTools title="시험 일정 작업">
        <div className="admin-workspace-toolbar">
          <div><h2 className="admin-section-title">시험 일정 목록</h2><p className="admin-help mt-1">전체 {schedules.length}개 · 활성 {schedules.filter((item) => item.isActive).length}개</p></div>
          <button type="button" onClick={openCreate} className="admin-button admin-button-primary"><Plus className="h-4 w-4" />일정 추가</button>
        </div>
        </MobileWorkspaceTools>
        {schedules.length === 0 ? <p className="admin-empty-state">등록된 시험 일정이 없습니다.</p> : (
          <div className="admin-table-frame"><table aria-label="시험 일정 목록">
            <thead><tr><th scope="col">시험명</th><th scope="col" className="hidden md:table-cell">종류</th><th scope="col">시험일</th><th scope="col" className="hidden md:table-cell">D-Day</th><th scope="col">상태</th></tr></thead>
            <tbody>{schedules.map((item) => <tr key={item.id}>
              <td className="admin-table-name"><button type="button" className="admin-table-link" onClick={() => openEdit(item)}>{item.name}</button><span className="admin-help block md:hidden">{getExamScheduleTypeLabel(item.type)}</span></td>
              <td className="hidden md:table-cell">{getExamScheduleTypeLabel(item.type)}</td>
              <td>{item.examDate}<span className="mt-1 block md:hidden"><DDayBadge dDayValue={item.dDayValue} dDayLabel={item.dDayLabel} /></span></td>
              <td className="hidden md:table-cell"><DDayBadge dDayValue={item.dDayValue} dDayLabel={item.dDayLabel} /></td>
              <td><span className={item.isActive ? "text-admin-success" : "text-admin-text-muted"}>{item.isActive ? "활성" : "비활성"}</span></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <SlideOver open={isCreating || Boolean(editingId)} title={editingId ? "시험 일정 수정" : "시험 일정 추가"} onClose={() => void closeEditor()}>
        <form id={formId} onSubmit={(event) => { event.preventDefault(); void handleSave(); }} className="space-y-6">
          <fieldset className="admin-panel" disabled={isSaving}>
            <label className="admin-form-row"><span className="admin-form-row-label">시험명</span><span className="admin-form-row-control w-full md:w-auto"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full" /></span></label>
            <label className="admin-form-row"><span className="admin-form-row-label">시험 종류</span><span className="admin-form-row-control w-full md:w-auto"><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ExamScheduleTypeValue })} className="w-full">{EXAM_SCHEDULE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></span></label>
            <label className="admin-form-row"><span className="admin-form-row-label">시험 날짜</span><span className="admin-form-row-control w-full md:w-auto"><input type="date" required value={form.examDate} onChange={(event) => setForm({ ...form, examDate: event.target.value })} className="w-full" /></span></label>
            <label className="admin-form-row"><span className="admin-form-row-label">메모</span><span className="admin-form-row-control w-full md:w-auto"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full" /></span></label>
            <label className="admin-form-row"><span className="admin-form-row-label">공개 상태</span><span className="admin-form-row-control flex w-full items-center gap-3 md:w-auto"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>학생 포털에 D-Day 표시</span></span></label>
          </fieldset>
          <DialogActions>
            {editingId ? <button type="button" disabled={isSaving} className="admin-button admin-button-danger-outline mr-auto" onClick={() => { const item = schedules.find((item) => item.id === editingId); if (item) void handleDelete(item); }}><Trash2 className="h-4 w-4" />삭제</button> : null}
            <button type="button" disabled={isSaving} onClick={() => void closeEditor()} className="admin-button">취소</button>
            <button type="submit" form={formId} disabled={isSaving} className="admin-button admin-button-primary">{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}저장</button>
          </DialogActions>
        </form>
      </SlideOver>
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
