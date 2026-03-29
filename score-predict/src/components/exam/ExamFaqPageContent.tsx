"use client";

import { useEffect, useState } from "react";

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  priority: number;
  updatedAt: string;
}

interface FaqsResponse {
  faqs: FaqItem[];
  error?: string;
}

interface ExamFaqPageContentProps {
  embedded?: boolean;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function ExamFaqPageContent({ embedded = false }: ExamFaqPageContentProps) {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/faqs", { method: "GET", cache: "no-store" });
        const data = (await response.json()) as FaqsResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "FAQ를 불러오지 못했습니다.");
        }

        if (!mounted) return;
        setFaqs(data.faqs ?? []);
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "FAQ를 불러오지 못했습니다.";
        setErrorMessage(message);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        FAQ를 불러오는 중입니다...
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
        {errorMessage}
      </section>
    );
  }

  if (faqs.length < 1) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        등록된 FAQ가 없습니다.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {!embedded ? <h1 className="text-lg font-semibold text-slate-900">자주 묻는 질문 (FAQ)</h1> : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {faqs.map((faq) => (
          <details key={faq.id} className="group border-b border-slate-200 last:border-b-0">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900">
              <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-xs text-white">
                Q
              </span>
              {faq.question}
            </summary>
            <div className="bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-700">
              <p className="whitespace-pre-line">{faq.answer}</p>
              <p className="mt-2 text-xs text-slate-500">최종 수정: {formatDate(faq.updatedAt)}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
