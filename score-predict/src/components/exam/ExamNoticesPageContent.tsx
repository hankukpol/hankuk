"use client";

import { useEffect, useState } from "react";

interface NoticeItem {
  id: number;
  title: string;
  content: string;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NoticesResponse {
  notices: NoticeItem[];
  error?: string;
}

interface ExamNoticesPageContentProps {
  embedded?: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return "상시";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "상시";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function ExamNoticesPageContent({ embedded = false }: ExamNoticesPageContentProps) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/notices", { method: "GET", cache: "no-store" });
        const data = (await response.json()) as NoticesResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "공지사항을 불러오지 못했습니다.");
        }

        if (!mounted) return;
        setNotices(data.notices ?? []);
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "공지사항을 불러오지 못했습니다.";
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
        공지사항을 불러오는 중입니다...
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

  if (notices.length < 1) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        등록된 공지사항이 없습니다.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {!embedded ? <h1 className="text-lg font-semibold text-slate-900">공지사항</h1> : null}
      <ul className="space-y-3">
        {notices.map((notice) => (
          <li key={notice.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                공지
              </span>
              <span className="text-xs text-slate-500">우선순위 {notice.priority}</span>
              <span className="text-xs text-slate-500">
                게시기간: {formatDate(notice.startAt)} ~ {formatDate(notice.endAt)}
              </span>
            </div>
            <h2 className="mt-3 text-base font-semibold text-slate-900">{notice.title}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{notice.content}</p>
            <p className="mt-3 text-xs text-slate-500">최종 수정: {formatDate(notice.updatedAt)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
