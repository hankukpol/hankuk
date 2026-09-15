"use client";
import { MobileWorkspaceTools } from "@/components/ui/MobileWorkspaceTools";

import { LoaderCircle, Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfigurationReview } from "@/components/settings/ConfigurationReview";
import { tuitionPlanSchema } from "@/lib/tuition-schemas";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { DialogActions } from "@/components/ui/DialogActions";
import { SlideOver } from "@/components/ui/SlideOver";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";

type TuitionPlanManagerProps = {
  divisionSlug: string;
  initialPlans: TuitionPlanItem[];
};

type FormState = {
  name: string;
  durationDays: string;
  amount: string;
  description: string;
  isActive: boolean;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

function toFormState(plan?: TuitionPlanItem | null): FormState {
  return {
    name: plan?.name ?? "",
    durationDays: plan?.durationDays ? String(plan.durationDays) : "",
    amount: plan ? String(plan.amount) : "",
    description: plan?.description ?? "",
    isActive: plan?.isActive ?? true,
  };
}

export function TuitionPlanManager({ divisionSlug, initialPlans }: TuitionPlanManagerProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(toFormState());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const editorFormId = useId();
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const {review,dialog}=useConfigurationReview(divisionSlug);

  const sortedPlans = useMemo(
    () =>
      [...plans].sort(
        (left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "ko"),
      ),
    [plans],
  );

  async function refreshPlans(showToast = false) {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/tuition-plans`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "등록 플랜 목록을 불러오지 못했습니다.");
      }

      setPlans(data.plans);

      if (showToast) {
        toast.success("등록 플랜을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "등록 플랜 목록을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  function startEdit(plan: TuitionPlanItem) {
    setEditingPlanId(plan.id);
    setForm(toFormState(plan));
    setIsEditorOpen(true);
  }

  function openCreateEditor() {
    setEditingPlanId(null);
    setForm(toFormState());
    setIsEditorOpen(true);
  }

  function closeEditor() {
    if (isSaving) return;
    setIsEditorOpen(false);
    setEditingPlanId(null);
    setForm(toFormState());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const input=tuitionPlanSchema.parse({name:form.name,durationDays:form.durationDays?Number(form.durationDays):null,amount:Number(form.amount),description:form.description||null,isActive:form.isActive});
      const result=await review("등록 플랜 변경",current=>{
        const next={...input,durationDays:input.durationDays??null,description:input.description??null,isActive:input.isActive??true};
        return {...current,tuitionPlans:editingPlanId?current.tuitionPlans.map(p=>p.id===editingPlanId?{...p,...next}:p):[...current.tuitionPlans,{...next,id:crypto.randomUUID(),displayOrder:current.tuitionPlans.length}]};
      });
      if(result?.status!=="APPLIED"){if(result?.status==="PENDING")setIsEditorOpen(false);return;}
      await refreshPlans();
      setIsEditorOpen(false);
      setEditingPlanId(null);
      setForm(toFormState());
      toast.success(editingPlanId ? "등록 플랜을 수정했습니다." : "등록 플랜을 추가했습니다.");
      showActionComplete({
        title: editingPlanId ? "등록 플랜 수정 완료" : "등록 플랜 추가 완료",
        description: editingPlanId
          ? "등록 플랜 정보가 수정되었습니다."
          : "새 등록 플랜이 추가되었습니다.",
        notice: "저장한 플랜은 학생 등록과 연장 수납 화면에서 바로 사용할 수 있습니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "등록 플랜 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(planId: string) {
    setIsDeletingId(planId);

    try {
      const result=await review("등록 플랜 비활성화",current=>({...current,tuitionPlans:current.tuitionPlans.map(p=>p.id===planId?{...p,isActive:false}:p)}));
      if(result?.status!=="APPLIED"){if(result?.status==="PENDING")setIsEditorOpen(false);return;}
      await refreshPlans();

      if (editingPlanId === planId) {
        closeEditor();
      }

      toast.success("등록 플랜을 비활성화했습니다.");
      showActionComplete({
        title: "등록 플랜 비활성화 완료",
        description: "선택한 등록 플랜이 비활성화되었습니다.",
        notice: "삭제한 플랜은 이후 등록/연장 화면에서 선택할 수 없습니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "등록 플랜 삭제에 실패했습니다.");
    } finally {
      setIsDeletingId(null);
    }
  }

  return (
    <>
      <section className="admin-section">
        <MobileWorkspaceTools title="등록 플랜 작업">
        <div className="admin-workspace-toolbar">
          <h2 className="admin-section-title">등록 플랜 목록</h2>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => refreshPlans(true)}
            disabled={isRefreshing}
            className="admin-button"
          >
            {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            새로고침
          </button>
          <button type="button" onClick={openCreateEditor} className="admin-button admin-button-primary">
            <Plus className="h-4 w-4" />
            새 플랜
          </button>
          </div>
        </div>

        </MobileWorkspaceTools>
        {sortedPlans.length > 0 ? (
          <div className="admin-table-frame mt-5 max-md:mt-0">
            <table>
              <thead>
                <tr>
                  <th>플랜</th>
                  <th>기간</th>
                  <th>금액</th>
                  <th className="hidden sm:table-cell">상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlans.map((plan) => (
                  <tr key={plan.id}>
                    <th scope="row" className="admin-table-name">
                      <button type="button" onClick={() => startEdit(plan)} className="admin-table-link">
                        {plan.name}
                      </button>
                      {plan.description ? <span className="admin-help mt-1 block">{plan.description}</span> : null}
                    </th>
                    <td>{plan.durationDays ? `${plan.durationDays}일` : "자유 설정"}</td>
                    <td className="admin-table-amount">{formatCurrency(plan.amount)}원</td>
                    <td className="hidden sm:table-cell"><span className="admin-badge">{plan.isActive ? "사용 중" : "비활성"}</span></td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        <button type="button" onClick={() => startEdit(plan)} className="admin-button admin-button-compact w-11 px-0" aria-label={`${plan.name} 수정`} title="플랜 수정">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(plan.id)} disabled={isDeletingId === plan.id} className="admin-button admin-button-compact admin-button-danger-outline w-11 px-0" aria-label={`${plan.name} 삭제`} title="플랜 삭제">
                          {isDeletingId === plan.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state mt-5">
            등록된 플랜이 없습니다. 새 플랜을 추가해 주세요.
          </div>
        )}
      </section>

      <SlideOver
        open={isEditorOpen}
        title={editingPlanId ? "등록 플랜 수정" : "등록 플랜 추가"}
        description="기간과 금액, 사용 여부를 저장하면 학생 등록과 연장 수납 화면에 반영됩니다."
        onClose={closeEditor}
      >
        <form id={editorFormId} onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="admin-label mb-2 block">플랜 이름</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full"
              placeholder="예: 4주반"
              required
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="admin-label mb-2 block">기간 일수</span>
              <input
                type="number"
                min={1}
                value={form.durationDays}
                onChange={(event) => setForm((current) => ({ ...current, durationDays: event.target.value }))}
                className="w-full"
                placeholder="예: 28"
              />
            </label>

            <label className="block">
              <span className="admin-label mb-2 block">금액</span>
              <input
                type="number"
                min={0}
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="w-full"
                placeholder="예: 320000"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="admin-label mb-2 block">설명</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-[120px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
              placeholder="학생 등록 화면에서 참고할 안내 문구를 적어 둘 수 있습니다."
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <span>
              <span className="admin-label block">사용 여부</span>
              <span className="admin-help block">
                비활성 플랜은 학생 등록 화면의 기본 목록에서 숨겨집니다.
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <DialogActions>
            <button type="button" onClick={closeEditor} disabled={isSaving} className="admin-button">
              취소
            </button>
            <button
              type="submit"
              form={editorFormId}
              disabled={isSaving}
              className="admin-button admin-button-primary"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingPlanId ? "플랜 저장" : "플랜 추가"}
            </button>
          </DialogActions>
        </form>
      </SlideOver>
      {dialog}
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
