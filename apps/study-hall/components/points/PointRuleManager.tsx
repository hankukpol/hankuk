"use client";
import { useConfigurationReview } from "@/components/settings/ConfigurationReview";
import { MobileWorkspaceTools } from "@/components/ui/MobileWorkspaceTools";

import { LoaderCircle, Pencil, Plus, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { AdminTabPanel, AdminTabs } from "@/components/ui/AdminTabs";
import { DialogActions } from "@/components/ui/DialogActions";
import { SlideOver } from "@/components/ui/SlideOver";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type { PointRuleItem } from "@/lib/services/point.service";

type PointRuleManagerProps = {
  divisionSlug: string;
};

type FormState = {
  category: string;
  name: string;
  points: number;
  description: string;
  isActive: boolean;
};

type PointRulesResponse = {
  rules?: PointRuleItem[];
  error?: string;
};

type PointCategoriesResponse = {
  categories?: string[];
  customizationEnabled?: boolean;
  error?: string;
};

function createDefaultForm(categories: string[]): FormState {
  return {
    category: categories[0] ?? "",
    name: "",
    points: -1,
    description: "",
    isActive: true,
  };
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="상벌점 규칙 불러오는 중">
      <div className="admin-skeleton h-11 w-60" />
      <div className="admin-skeleton h-16 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="admin-skeleton h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

export function PointRuleManager({ divisionSlug }: PointRuleManagerProps) {
  const {review, dialog} = useConfigurationReview(divisionSlug);
  const [activeTab, setActiveTab] = useState<"rules" | "categories">("rules");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isCategoryEditorOpen, setIsCategoryEditorOpen] = useState(false);
  const [originalForm, setOriginalForm] = useState<FormState>(() => createDefaultForm([]));
  const editorFormId = useId();
  const categoryFormId = useId();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [rules, setRules] = useState<PointRuleItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryCustomizationEnabled, setCategoryCustomizationEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => createDefaultForm([]));
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [deletingCategoryName, setDeletingCategoryName] = useState<string | null>(null);

  const orderedCategories = useMemo(() => {
    const orderedCategories = [...categories];

    for (const rule of rules) {
      if (!orderedCategories.includes(rule.category)) {
        orderedCategories.push(rule.category);
      }
    }

    return orderedCategories;
  }, [categories, rules]);

  const filteredRules = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return rules.filter((rule) =>
      (!categoryFilter || rule.category === categoryFilter)
      && (!statusFilter || rule.isActive === (statusFilter === "active"))
      && (!keyword || `${rule.name} ${rule.description ?? ""} ${rule.category}`.toLocaleLowerCase().includes(keyword)),
    );
  }, [rules, search, categoryFilter, statusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [rulesResponse, categoriesResponse] = await Promise.all([
          fetch(`/api/${divisionSlug}/point-rules`, { cache: "no-store" }),
          fetch(`/api/${divisionSlug}/point-categories`, { cache: "no-store" }),
        ]);

        const rulesData = (await rulesResponse.json()) as PointRulesResponse;
        const categoriesData = (await categoriesResponse.json()) as PointCategoriesResponse;

        if (!rulesResponse.ok) {
          throw new Error(rulesData.error ?? "상벌점 규칙을 불러오지 못했습니다.");
        }

        if (!categoriesResponse.ok) {
          throw new Error(categoriesData.error ?? "상벌점 카테고리를 불러오지 못했습니다.");
        }

        if (cancelled) {
          return;
        }

        const nextRules = rulesData.rules ?? [];
        const nextCategories = categoriesData.categories ?? [];

        setRules(nextRules);
        setCategories(nextCategories);
        setCategoryCustomizationEnabled(Boolean(categoriesData.customizationEnabled));
        setForm((current) => {
          if (current.category && nextCategories.includes(current.category)) {
            return current;
          }

          return {
            ...current,
            category: nextCategories[0] ?? "",
          };
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "상벌점 설정 데이터를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [divisionSlug]);

  useEffect(() => {
    if (form.category || categories.length === 0) {
      return;
    }

    setForm((current) => ({ ...current, category: categories[0] }));
  }, [categories, form.category]);

  function resetForm(nextCategories = categories) {
    setEditingId(null);
    setForm(createDefaultForm(nextCategories));
  }

  function resetCategoryForm() {
    setEditingCategoryName(null);
    setCategoryName("");
  }

  function openCreateEditor() {
    const nextForm = createDefaultForm(categories);
    setEditingId(null);
    setForm(nextForm);
    setOriginalForm(nextForm);
    setIsEditorOpen(true);
  }

  async function closeEditor() {
    if (isSaving) return;
    if (JSON.stringify(form) !== JSON.stringify(originalForm) && !(await confirm({
      title: "규칙 수정을 취소할까요?",
      description: "저장하지 않은 변경사항이 사라집니다.",
      confirmLabel: "변경 폐기",
      cancelLabel: "계속 편집",
      variant: "warning",
    }))) return;
    setIsEditorOpen(false);
  }

  async function closeCategoryEditor() {
    if (isCategorySaving) return;
    if (categoryName !== (editingCategoryName ?? "") && !(await confirm({
      title: "카테고리 수정을 취소할까요?",
      description: "저장하지 않은 변경사항이 사라집니다.",
      confirmLabel: "변경 폐기",
      cancelLabel: "계속 편집",
      variant: "warning",
    }))) return;
    setIsCategoryEditorOpen(false);
  }

  function startEdit(rule: PointRuleItem) {
    setEditingId(rule.id);
    const nextForm = {
      category: rule.category,
      name: rule.name,
      points: rule.points,
      description: rule.description ?? "",
      isActive: rule.isActive,
    };
    setForm(nextForm);
    setOriginalForm(nextForm);
    setIsEditorOpen(true);
  }

  function startCategoryEdit(category: string) {
    setEditingCategoryName(category);
    setCategoryName(category);
    setIsCategoryEditorOpen(true);
  }

  async function refreshRules() {
    const response = await fetch(`/api/${divisionSlug}/point-rules`, {
      cache: "no-store",
    });
    const data = (await response.json()) as PointRulesResponse;

    if (!response.ok) {
      throw new Error(data.error ?? "상벌점 규칙을 불러오지 못했습니다.");
    }

    setRules(data.rules ?? []);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.category) {
      toast.error("먼저 카테고리를 추가해 주세요.");
      return;
    }

    setIsSaving(true);

    try {
      const result=await review("상벌점 규칙 변경", current=>{
        const next={category:form.category,name:form.name.trim(),points:Number(form.points),description:form.description||null,isActive:form.isActive};
        current.pointRules=editingId ? current.pointRules.map(r=>r.id===editingId?{...r,...next}:r) : [...current.pointRules,{...next,id:crypto.randomUUID(),displayOrder:current.pointRules.length}];
        return current;
      });
      if(result?.status!=="APPLIED"){if(result?.status==="PENDING")setIsEditorOpen(false);return;}
      toast.success(editingId ? "규칙을 수정했습니다." : "규칙을 추가했습니다.");
      await refreshRules();
      resetForm();
      setIsEditorOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "상벌점 규칙 저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(ruleId: string) {
    const rule = rules.find((item) => item.id === ruleId);
    if (!(await confirm({ title: "상벌점 규칙을 삭제할까요?", description: `${rule?.name ?? "선택한"} 규칙을 삭제합니다.`, confirmLabel: "삭제", variant: "danger" }))) return;
    setDeletingId(ruleId);

    try {
      const result=await review("상벌점 규칙 비활성화",current=>({...current,pointRules:current.pointRules.map(r=>r.id===ruleId?{...r,isActive:false}:r)}));
      if(result?.status!=="APPLIED"){if(result?.status==="PENDING")setIsEditorOpen(false);return;}
      await refreshRules();
      toast.success("기존 점수를 보존하고 규칙을 비활성화했습니다.");

      if (editingId === ruleId) {
        resetForm();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "상벌점 규칙 삭제에 실패했습니다.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCategorySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCategorySaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/point-categories`, {
        method: editingCategoryName ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          editingCategoryName
            ? {
                currentName: editingCategoryName,
                nextName: categoryName,
              }
            : {
                name: categoryName,
              },
        ),
      });
      const data = (await response.json()) as PointCategoriesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 카테고리 저장에 실패했습니다.");
      }

      const nextCategories = data.categories ?? [];
      const nextSelectedCategory =
        editingCategoryName && form.category === editingCategoryName
          ? categoryName.trim()
          : form.category || nextCategories[0] || "";

      setCategories(nextCategories);
      if (editingCategoryName && categoryFilter === editingCategoryName) {
        setCategoryFilter(categoryName.trim());
      }
      setForm((current) => ({
        ...current,
        category: nextSelectedCategory,
      }));

      toast.success(
        editingCategoryName ? "카테고리를 수정했습니다." : "카테고리를 추가했습니다.",
      );
      if (editingCategoryName) {
        setRules((current) => current.map((rule) => rule.category === editingCategoryName
          ? { ...rule, category: categoryName.trim() }
          : rule));
      }
      resetCategoryForm();
      setIsCategoryEditorOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "상벌점 카테고리 저장에 실패했습니다.",
      );
    } finally {
      setIsCategorySaving(false);
    }
  }

  async function handleCategoryDelete(category: string) {
    if (!(await confirm({ title: "카테고리를 삭제할까요?", description: `${category} 카테고리를 삭제합니다. 사용 중인 규칙이 있으면 삭제할 수 없습니다.`, confirmLabel: "삭제", variant: "danger" }))) return;
    setDeletingCategoryName(category);

    try {
      const response = await fetch(`/api/${divisionSlug}/point-categories`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: category }),
      });
      const data = (await response.json()) as PointCategoriesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 카테고리 삭제에 실패했습니다.");
      }

      const nextCategories = data.categories ?? [];
      setCategories(nextCategories);
      if (categoryFilter === category) setCategoryFilter("");

      if (form.category === category) {
        setForm((current) => ({
          ...current,
          category: nextCategories[0] ?? "",
        }));
      }

      if (editingCategoryName === category) {
        resetCategoryForm();
      }

      toast.success("카테고리를 삭제했습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "상벌점 카테고리 삭제에 실패했습니다.",
      );
    } finally {
      setDeletingCategoryName(null);
    }
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (loadError) {
    return (
      <div className="admin-notice admin-notice-danger">
        <p className="font-semibold">상벌점 설정을 불러오지 못했습니다.</p>
        <p className="mt-2">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="admin-button admin-button-danger-outline mt-4"
        >
          새로고침
        </button>
      </div>
    );
  }

  function renderRuleActions(rule: PointRuleItem) {
    return (
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => startEdit(rule)} className="admin-icon-button" aria-label={rule.name + " 수정"} title="규칙 수정">
          <Pencil className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void handleDelete(rule.id)} disabled={deletingId !== null} className="admin-icon-button text-admin-danger" aria-label={rule.name + " 비활성화"} title="규칙 비활성화">
          {deletingId === rule.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  function renderStatus(isActive: boolean) {
    return <span className={"admin-badge " + (isActive ? "border-admin-success-line bg-admin-success-soft text-admin-success" : "bg-admin-surface-muted text-admin-text-muted")}>{isActive ? "사용 중" : "비활성"}</span>;
  }

  return (
    <div className="admin-compact-workspace min-w-0 space-y-5">
      <AdminTabs
        items={[{ id: "rules", label: "규칙 목록" }, { id: "categories", label: "카테고리" }]}
        activeId={activeTab}
        onChange={setActiveTab}
        label="상벌점 규칙 관리"
        idPrefix="point-rule-settings"
        variant="secondary"
      />

      <AdminTabPanel id="rules" activeId={activeTab} idPrefix="point-rule-settings" className="space-y-5 max-md:space-y-0">
        <MobileWorkspaceTools title="상벌점 규칙 조회·추가" active={activeTab === "rules"}>
        <div className="admin-workspace-toolbar">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="admin-section-title">상벌점 규칙</h2>
            <span className="admin-help" aria-live="polite">{filteredRules.length} / {rules.length}개</span>
          </div>
          <button type="button" onClick={openCreateEditor} disabled={categories.length === 0} className="admin-button admin-button-primary">
            <Plus className="h-4 w-4" /> 새 규칙
          </button>
        </div>

        <div className="admin-filter-bar">
          <div className="grid w-full gap-3 md:grid-cols-4">
            <label className="admin-field md:col-span-2">
              <span className="admin-label">규칙 검색</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text-muted" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="규칙 이름, 설명" className="w-full pl-10" />
              </div>
            </label>
            <label className="admin-field">
              <span className="admin-label">카테고리</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="w-full">
                <option value="">전체 카테고리</option>
                {orderedCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-label">사용 상태</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full">
                <option value="">전체 상태</option>
                <option value="active">사용 중</option>
                <option value="inactive">비활성</option>
              </select>
            </label>
          </div>
        </div>

        </MobileWorkspaceTools>
        {filteredRules.length > 0 ? (
          <>
            <div className="admin-table-frame">
              <table>
                <caption className="sr-only">상벌점 규칙 목록</caption>
                <thead>
                  <tr><th scope="col" className="hidden md:table-cell">카테고리</th><th scope="col">규칙명 · 적용 기준</th><th scope="col">점수</th><th scope="col" className="hidden md:table-cell">상태</th><th scope="col">관리</th></tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="hidden md:table-cell"><PointCategoryBadge category={rule.category} /></td>
                      <th scope="row" className="admin-table-name">
                        <span className="admin-help mb-1 block md:hidden">{rule.category}</span>
                        <button type="button" onClick={() => startEdit(rule)} className="admin-table-link">{rule.name}</button>
                        {rule.description ? <span className="admin-help mt-1 block">{rule.description}</span> : null}
                        <span className="mt-2 block md:hidden">{renderStatus(rule.isActive)}</span>
                      </th>
                      <td className="admin-table-amount"><PointValueBadge points={rule.points} /></td>
                      <td className="hidden md:table-cell">{renderStatus(rule.isActive)}</td>
                      <td>{renderRuleActions(rule)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="admin-empty-state">
            <p>{rules.length ? "검색 조건에 맞는 규칙이 없습니다." : "등록된 상벌점 규칙이 없습니다."}</p>
            {search || categoryFilter || statusFilter ? (
              <button type="button" onClick={() => { setSearch(""); setCategoryFilter(""); setStatusFilter(""); }} className="admin-button mt-3">
                <RotateCcw className="h-4 w-4" /> 조건 초기화
              </button>
            ) : categories.length === 0 ? (
              <button type="button" onClick={() => setActiveTab("categories")} className="admin-button mt-3">카테고리 관리</button>
            ) : null}
          </div>
        )}
      </AdminTabPanel>

      <AdminTabPanel id="categories" activeId={activeTab} idPrefix="point-rule-settings" className="space-y-5 max-md:space-y-0">
        <MobileWorkspaceTools title="상벌점 카테고리 작업" active={activeTab === "categories"}>
        <div className="admin-workspace-toolbar">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="admin-section-title">카테고리</h2>
            <span className="admin-help">{categories.length}개</span>
          </div>
          {categoryCustomizationEnabled ? (
            <button type="button" onClick={() => { resetCategoryForm(); setIsCategoryEditorOpen(true); }} className="admin-button admin-button-primary">
              <Plus className="h-4 w-4" /> 카테고리 추가
            </button>
          ) : null}
        </div>
        </MobileWorkspaceTools>
        {!categoryCustomizationEnabled ? <p className="admin-notice">현재 학원은 기본 카테고리를 사용합니다.</p> : null}
        {categories.length ? (
          <div className="admin-table-frame">
            <table>
              <caption className="sr-only">상벌점 카테고리 목록</caption>
              <thead><tr><th scope="col">카테고리</th><th scope="col">등록 규칙</th>{categoryCustomizationEnabled ? <th scope="col">관리</th> : null}</tr></thead>
              <tbody>
                {categories.map((category) => {
                  const categoryRules = rules.filter((rule) => rule.category === category);
                  return (
                    <tr key={category}>
                      <th scope="row" className="admin-table-name"><PointCategoryBadge category={category} /></th>
                      <td>
                        <button type="button" onClick={() => { setCategoryFilter(category); setSearch(""); setStatusFilter(""); setActiveTab("rules"); }} className="admin-table-link" aria-label={category + " 규칙 " + categoryRules.length + "개 보기"}>{categoryRules.length}개</button>
                        <span className="admin-help mt-1 block">사용 중 {categoryRules.filter((rule) => rule.isActive).length}개</span>
                      </td>
                      {categoryCustomizationEnabled ? (
                        <td>
                          <div className="flex items-center justify-center gap-2">
                            <button type="button" onClick={() => startCategoryEdit(category)} className="admin-icon-button" aria-label={category + " 카테고리 수정"} title="카테고리 수정"><Pencil className="h-4 w-4" /></button>
                            <button type="button" onClick={() => void handleCategoryDelete(category)} disabled={deletingCategoryName !== null} className="admin-icon-button text-admin-danger" aria-label={category + " 카테고리 삭제"} title="카테고리 삭제">
                              {deletingCategoryName === category ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="admin-empty-state">등록된 카테고리가 없습니다.</div>}
      </AdminTabPanel>

      <SlideOver open={isEditorOpen} title={editingId ? "상벌점 규칙 수정" : "상벌점 규칙 추가"} onClose={() => void closeEditor()}>
        <form id={editorFormId} onSubmit={handleSubmit}>
          <fieldset disabled={isSaving} className="admin-panel min-w-0">
            <label className="admin-form-row">
              <span className="admin-form-row-label">카테고리</span>
              <span className="admin-form-row-control w-full md:w-auto">
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} disabled={categories.length === 0} className="w-full" required>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              </span>
            </label>
            <label className="admin-form-row">
              <span className="admin-form-row-label">규칙 이름</span>
              <span className="admin-form-row-control w-full md:w-auto">
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="예: 지각" className="w-full" required />
              </span>
            </label>
            <label className="admin-form-row">
              <span className="admin-form-row-label">점수 (상점 + / 벌점 -)</span>
              <span className="admin-form-row-control w-full md:w-auto">
              <input type="number" step={1} value={form.points} onChange={(event) => setForm((current) => ({ ...current, points: Number(event.target.value) }))} className="w-full" required />
              </span>
            </label>
            <label className="admin-form-row">
              <span className="admin-form-row-label">적용 기준</span>
              <span className="admin-form-row-control w-full md:w-auto">
              <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="규칙이 적용되는 상황" className="w-full" />
              </span>
            </label>
            <label className="admin-form-row">
              <span className="admin-form-row-label">사용 여부</span>
              <span className="admin-form-row-control w-full md:w-auto flex items-center gap-3">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-5 w-5 shrink-0" />
                <span className="admin-help">비활성 규칙은 상벌점 부여 목록에서 제외됩니다.</span>
              </span>
            </label>
          </fieldset>
          <DialogActions>
            <button type="button" onClick={() => void closeEditor()} disabled={isSaving} className="admin-button">취소</button>
            <button type="submit" form={editorFormId} disabled={isSaving || categories.length === 0} className="admin-button admin-button-primary">
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "변경 저장" : "규칙 추가"}
            </button>
          </DialogActions>
        </form>
      </SlideOver>

      <SlideOver open={isCategoryEditorOpen} title={editingCategoryName ? "카테고리 수정" : "카테고리 추가"} onClose={() => void closeCategoryEditor()}>
        <form id={categoryFormId} onSubmit={handleCategorySubmit} className="space-y-5">
          <label className="admin-field">
            <span className="admin-label">카테고리 이름</span>
            <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} disabled={isCategorySaving} placeholder="예: 생활지도" className="w-full" required />
          </label>
          {editingCategoryName ? <p className="admin-notice">이 카테고리에 속한 규칙에도 변경된 이름이 적용됩니다.</p> : null}
          <DialogActions>
            <button type="button" onClick={() => void closeCategoryEditor()} disabled={isCategorySaving} className="admin-button">취소</button>
            <button type="submit" form={categoryFormId} disabled={isCategorySaving} className="admin-button admin-button-primary">
              {isCategorySaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingCategoryName ? "변경 저장" : "카테고리 추가"}
            </button>
          </DialogActions>
        </form>
      </SlideOver>
      {confirmDialog}{dialog}
    </div>
  );
}
