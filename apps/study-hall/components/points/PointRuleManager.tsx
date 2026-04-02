"use client";

import { LoaderCircle, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
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
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="h-7 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-5 space-y-3">
          <div className="h-24 animate-pulse rounded-[10px] bg-slate-100" />
          <div className="h-24 animate-pulse rounded-[10px] bg-slate-100" />
          <div className="h-24 animate-pulse rounded-[10px] bg-slate-100" />
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <div className="h-7 w-44 animate-pulse rounded bg-slate-100" />
          <div className="mt-5 h-28 animate-pulse rounded-[10px] bg-slate-100" />
        </div>

        <div className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <div className="h-7 w-36 animate-pulse rounded bg-slate-100" />
          <div className="mt-5 h-72 animate-pulse rounded-[10px] bg-slate-100" />
        </div>
      </section>
    </div>
  );
}

export function PointRuleManager({ divisionSlug }: PointRuleManagerProps) {
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

  const groupedRules = useMemo(() => {
    const orderedCategories = [...categories];

    for (const rule of rules) {
      if (!orderedCategories.includes(rule.category)) {
        orderedCategories.push(rule.category);
      }
    }

    return orderedCategories.map((category) => ({
      category,
      rules: rules.filter((rule) => rule.category === category),
    }));
  }, [categories, rules]);

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

  function startEdit(rule: PointRuleItem) {
    setEditingId(rule.id);
    setForm({
      category: rule.category,
      name: rule.name,
      points: rule.points,
      description: rule.description ?? "",
      isActive: rule.isActive,
    });
  }

  function startCategoryEdit(category: string) {
    setEditingCategoryName(category);
    setCategoryName(category);
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
      const response = await fetch(
        editingId
          ? `/api/${divisionSlug}/point-rules/${editingId}`
          : `/api/${divisionSlug}/point-rules`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category: form.category,
            name: form.name,
            points: Number(form.points),
            description: form.description || null,
            isActive: form.isActive,
          }),
        },
      );
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 규칙 저장에 실패했습니다.");
      }

      toast.success(editingId ? "규칙을 수정했습니다." : "규칙을 추가했습니다.");
      await refreshRules();
      resetForm();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "상벌점 규칙 저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(ruleId: string) {
    setDeletingId(ruleId);

    try {
      const response = await fetch(`/api/${divisionSlug}/point-rules/${ruleId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 규칙 삭제에 실패했습니다.");
      }

      setRules((current) => current.filter((rule) => rule.id !== ruleId));
      toast.success("규칙을 삭제했습니다.");

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
      setForm((current) => ({
        ...current,
        category: nextSelectedCategory,
      }));

      toast.success(
        editingCategoryName ? "카테고리를 수정했습니다." : "카테고리를 추가했습니다.",
      );
      resetCategoryForm();
      await refreshRules();
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
      <div className="rounded-[10px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        <p className="font-semibold">상벌점 설정을 불러오지 못했습니다.</p>
        <p className="mt-2">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
        >
          새로고침
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              규칙 목록
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              상벌점 규칙 목록
            </h2>
          </div>

          <button
            type="button"
            onClick={() => resetForm()}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            새 규칙
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {groupedRules.length > 0 ? (
            groupedRules.map((group) => (
              <div key={group.category}>
                <div className="mb-3 flex items-center gap-2">
                  <PointCategoryBadge category={group.category} />
                  <span className="text-sm font-medium text-slate-600">
                    {group.category}
                  </span>
                </div>

                {group.rules.length > 0 ? (
                  <div className="space-y-3">
                    {group.rules.map((rule) => (
                      <article
                        key={rule.id}
                        className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xl font-bold text-slate-950">
                              {rule.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {rule.description || "설명 없음"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <PointValueBadge points={rule.points} />
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                rule.isActive
                                  ? "bg-white border border-slate-200-slate-200 text-emerald-700"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {rule.isActive ? "활성" : "비활성"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(rule)}
                            className="rounded-full border border-slate-200-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(rule.id)}
                            disabled={deletingId === rule.id}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-white disabled:opacity-60"
                          >
                            {deletingId === rule.id ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            삭제
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    이 카테고리에 등록된 규칙이 없습니다.
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
              등록된 상벌점 규칙이 없습니다. 먼저 카테고리를 확인한 뒤 규칙을
              추가해 주세요.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            카테고리 관리
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">
            상벌점 카테고리 설정
          </h2>
          {categoryCustomizationEnabled ? (
            <>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                규칙 추가 전에 사용할 카테고리를 먼저 등록하세요. 카테고리 이름을
                바꾸면 해당 카테고리를 쓰는 규칙도 함께 반영됩니다.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <div
                    key={category}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2"
                  >
                    <PointCategoryBadge category={category} />
                    <button
                      type="button"
                      onClick={() => startCategoryEdit(category)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                      aria-label="카테고리 수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCategoryDelete(category)}
                      disabled={deletingCategoryName === category}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
                      aria-label="카테고리 삭제"
                    >
                      {deletingCategoryName === category ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleCategorySubmit}
                className="mt-5 flex flex-col gap-3 sm:flex-row"
              >
                <input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  className="flex-1 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="예: 생활지도"
                  required
                />

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isCategorySaving}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {isCategorySaving ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {editingCategoryName ? "카테고리 수정" : "카테고리 추가"}
                  </button>

                  {editingCategoryName ? (
                    <button
                      type="button"
                      onClick={resetCategoryForm}
                      className="rounded-full border border-slate-200-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      취소
                    </button>
                  ) : null}
                </div>
              </form>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                현재 운영 DB에서는 카테고리 사용자 지정이 아직 적용되지 않아 기본
                카테고리만 사용할 수 있습니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <div
                    key={category}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2"
                  >
                    <PointCategoryBadge category={category} />
                    <span className="text-sm font-medium text-slate-600">
                      {category}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            {editingId ? "규칙 수정" : "규칙 추가"}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">
            {editingId ? "규칙 수정" : "규칙 추가"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                카테고리
              </span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                disabled={categories.length === 0}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))
                ) : (
                  <option value="">먼저 카테고리를 추가해 주세요.</option>
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                규칙 이름
              </span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: 지각"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                점수
              </span>
              <input
                type="number"
                value={form.points}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    points: Number(event.target.value),
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                설명
              </span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-[120px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="규칙 적용 기준을 남겨둘 수 있습니다."
              />
            </label>

            <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  활성화
                </span>
                <span className="block text-xs text-slate-500">
                  비활성 규칙은 부여 폼에서 숨겨집니다.
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="h-5 w-5 rounded border-slate-300"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isSaving || categories.length === 0}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {editingId ? "규칙 저장" : "규칙 추가"}
              </button>

              <button
                type="button"
                onClick={() => resetForm()}
                className="rounded-full border border-slate-200-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                초기화
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
