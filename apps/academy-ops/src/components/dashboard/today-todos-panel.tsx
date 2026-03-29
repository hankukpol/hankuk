"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TodoItem = {
  id: string;
  type: "OVERDUE_INSTALLMENT" | "PENDING_REFUND" | "DUE_MEMO" | "EXPIRING_ENROLLMENT";
  label: string;
  subLabel: string;
  urgency: "high" | "medium" | "low";
  href: string;
  dueDate?: string;
};

type TodosResponse = {
  data: {
    todos: TodoItem[];
    counts: {
      overdueInstallments: number;
      pendingRefunds: number;
      dueMemos: number;
      expiringEnrollments: number;
    };
  };
};

const TYPE_STYLE: Record<TodoItem["type"], { icon: string; badge: string }> = {
  OVERDUE_INSTALLMENT: {
    icon: "⚠️",
    badge: "border-red-200 bg-red-50 text-red-700",
  },
  PENDING_REFUND: {
    icon: "↩️",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
  },
  DUE_MEMO: {
    icon: "📌",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
  },
  EXPIRING_ENROLLMENT: {
    icon: "🕐",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
  },
};

const TYPE_LABEL: Record<TodoItem["type"], string> = {
  OVERDUE_INSTALLMENT: "미납",
  PENDING_REFUND: "환불 대기",
  DUE_MEMO: "메모 마감",
  EXPIRING_ENROLLMENT: "만료 임박",
};

export function TodayTodosPanel() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/todos", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("할 일 목록을 불러오지 못했습니다.");
        return res.json() as Promise<TodosResponse>;
      })
      .then((payload) => {
        setTodos(payload.data.todos);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">오늘의 할 일</h2>
          <p className="mt-1 text-xs text-slate">미납 마감 · 환불 대기 · 메모 마감 · 만료 임박 자동 집계</p>
        </div>
        <Link
          href="/admin/memos"
          className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20"
        >
          메모 보드
        </Link>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate">
            로딩 중...
          </div>
        ) : error ? (
          <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : todos.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center text-sm text-slate">
            오늘 처리할 긴급 항목이 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {todos.map((todo) => {
              const style = TYPE_STYLE[todo.type];
              return (
                <li key={todo.id}>
                  <Link
                    href={todo.href}
                    className="flex items-center gap-3 rounded-[16px] border border-ink/10 bg-mist/40 px-4 py-3 transition hover:border-ember/30 hover:bg-ember/5"
                  >
                    <span className="shrink-0 text-lg leading-none">{style.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
                        >
                          {TYPE_LABEL[todo.type]}
                        </span>
                        <span className="truncate text-sm font-medium text-ink">
                          {todo.label}
                        </span>
                      </div>
                      {todo.subLabel && (
                        <p className="mt-0.5 text-xs text-slate">{todo.subLabel}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm text-slate">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
