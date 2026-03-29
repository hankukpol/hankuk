"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface FaqsResponse {
  faqs: FaqItem[];
  error?: string;
}

type StatusMessage = { type: "success" | "error"; text: string } | null;

export default function AdminFaqsPage() {
  const { enabled: faqsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("faqs");
  const [items, setItems] = useState<FaqItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<StatusMessage>(null);
  const { confirm, modalProps } = useConfirmModal();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.priority === b.priority ? b.id - a.id : b.priority - a.priority)),
    [items]
  );

  async function load() {
    const response = await fetch("/api/admin/faqs", { method: "GET", cache: "no-store" });
    const data = (await response.json()) as FaqsResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "FAQ 목록을 불러오지 못했습니다.");
    }
    setItems(data.faqs ?? []);
  }

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!faqsEnabled) {
      setIsLoading(false);
      setMessage(null);
      return;
    }

    (async () => {
      try {
        setIsLoading(true);
        await load();
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "FAQ 목록을 불러오지 못했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [faqsEnabled, isFeatureLoading]);

  function resetForm() {
    setEditingId(null);
    setQuestion("");
    setAnswer("");
    setPriority(0);
    setIsActive(true);
  }

  function startEdit(item: FaqItem) {
    setEditingId(item.id);
    setQuestion(item.question);
    setAnswer(item.answer);
    setPriority(item.priority);
    setIsActive(item.isActive);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!question.trim()) {
      setMessage({ type: "error", text: "질문을 입력해 주세요." });
      return;
    }
    if (!answer.trim()) {
      setMessage({ type: "error", text: "답변을 입력해 주세요." });
      return;
    }

    const ok = await confirm({ title: editingId ? "FAQ 수정" : "FAQ 등록", description: editingId ? "FAQ를 수정하시겠습니까?" : "FAQ를 등록하시겠습니까?" });
    if (!ok) return;

    try {
      setIsSaving(true);
      const endpoint = editingId ? `/api/admin/faqs?id=${editingId}` : "/api/admin/faqs";
      const method = editingId ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
          priority,
          isActive,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "FAQ 저장에 실패했습니다.");
      }

      setMessage({
        type: "success",
        text: editingId ? "FAQ가 수정되었습니다." : "FAQ가 등록되었습니다.",
      });
      resetForm();
      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "FAQ 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const ok = await confirm({ title: "FAQ 삭제", description: "FAQ를 삭제하시겠습니까?", variant: "danger" });
    if (!ok) return;
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/faqs?id=${id}`, { method: "DELETE" });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "FAQ 삭제에 실패했습니다.");
      }

      setMessage({ type: "success", text: "FAQ가 삭제되었습니다." });
      if (editingId === id) resetForm();
      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "FAQ 삭제에 실패했습니다.",
      });
    }
  }

  if (isFeatureLoading || (faqsEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">FAQ 관리 화면을 불러오는 중입니다...</p>;
  }

  if (!faqsEnabled) {
    return <AdminFeatureDisabledState feature="faqs" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">FAQ 관리</h1>
          <p className="mt-1 text-sm text-slate-600">사용자 화면의 FAQ 탭에 노출될 질문/답변을 관리합니다.</p>
        </div>
        <Button type="button" variant="outline" onClick={resetForm}>
          새 FAQ 작성
        </Button>
      </header>

      {message ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="space-y-2">
          <Label htmlFor="faq-question">질문</Label>
          <Input id="faq-question" value={question} onChange={(e) => setQuestion(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="faq-answer">답변</Label>
          <textarea
            id="faq-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="faq-priority">우선순위</Label>
            <Input id="faq-priority" type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value) || 0)} />
          </div>
          <label className="mt-8 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            활성 FAQ로 표시
          </label>
        </div>

        <Button type="submit" disabled={isSaving}>
          {isSaving ? "저장 중..." : editingId ? "FAQ 수정" : "FAQ 등록"}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">질문</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length < 1 ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={4}>
                  등록된 FAQ가 없습니다.
                </td>
              </tr>
            ) : (
              sorted.map((item) => (
                <tr key={item.id} className="bg-white">
                  <td className="px-4 py-3 text-slate-700">{item.id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.question}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-600">{item.answer}</p>
                  </td>
                  <td className="px-4 py-3">
                    {item.isActive ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <Button type="button" variant="outline" onClick={() => startEdit(item)}>
                        수정
                      </Button>
                      <Button type="button" variant="outline" onClick={() => void handleDelete(item.id)}>
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
