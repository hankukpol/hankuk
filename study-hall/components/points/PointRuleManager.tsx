"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { POINT_CATEGORY_OPTIONS } from "@/lib/point-meta";
import type { PointRuleItem } from "@/lib/services/point.service";

type PointRuleManagerProps = {
  divisionSlug: string;
  initialRules: PointRuleItem[];
};

type FormState = {
  category: (typeof POINT_CATEGORY_OPTIONS)[number]["value"];
  name: string;
  points: number;
  description: string;
  isActive: boolean;
};

const defaultForm: FormState = {
  category: "ATTENDANCE",
  name: "",
  points: -1,
  description: "",
  isActive: true,
};

export function PointRuleManager({ divisionSlug, initialRules }: PointRuleManagerProps) {
  const [rules, setRules] = useState(initialRules);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groupedRules = useMemo(() => {
    return POINT_CATEGORY_OPTIONS.map((category) => ({
      ...category,
      rules: rules.filter((rule) => rule.category === category.value),
    }));
  }, [rules]);

  function resetForm() {
    setEditingId(null);
    setForm(defaultForm);
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

  async function refreshRules() {
    const response = await fetch(`/api/${divisionSlug}/point-rules`, {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "상벌점 규칙을 불러오지 못했습니다.");
    }

    setRules(data.rules);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 규칙 저장에 실패했습니다.");
      }

      toast.success(editingId ? "규칙을 수정했습니다." : "규칙을 추가했습니다.");
      await refreshRules();
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상벌점 규칙 저장에 실패했습니다.");
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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 규칙 삭제에 실패했습니다.");
      }

      setRules((current) => current.filter((rule) => rule.id !== ruleId));
      toast.success("규칙을 삭제했습니다.");

      if (editingId === ruleId) {
        resetForm();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상벌점 규칙 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              규칙 목록
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">상벌점 규칙 목록</h2>
          </div>

          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            새 규칙
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {groupedRules.map((group) => (
            <div key={group.value}>
              <div className="mb-3 flex items-center gap-2">
                <PointCategoryBadge category={group.value} />
                <span className="text-sm font-medium text-slate-600">{group.label}</span>
              </div>

              <div className="space-y-3">
                {group.rules.map((rule) => (
                  <article
                    key={rule.id}
                    className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold text-slate-950">{rule.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{rule.description || "설명 없음"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <PointValueBadge points={rule.points} />
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            rule.isActive ? "bg-white border border-slate-200-slate-200 text-emerald-700" : "bg-slate-200 text-slate-600"
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
                        onClick={() => handleDelete(rule.id)}
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
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          {editingId ? "규칙 수정" : "규칙 추가"}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          {editingId ? "규칙 수정" : "규칙 추가"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">카테고리</span>
            <select
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as FormState["category"],
                }))
              }
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            >
              {POINT_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">규칙 이름</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 지각"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">점수</span>
            <input
              type="number"
              value={form.points}
              onChange={(event) =>
                setForm((current) => ({ ...current, points: Number(event.target.value) }))
              }
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">설명</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-[120px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="규칙 적용 기준을 남겨둘 수 있습니다."
            />
          </label>

          <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">활성화</span>
              <span className="block text-xs text-slate-500">비활성 규칙은 부여 폼에서 숨겨집니다.</span>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "규칙 저장" : "규칙 추가"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="rounded-full border border-slate-200-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              초기화
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
