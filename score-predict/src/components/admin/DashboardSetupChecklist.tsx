import Link from "next/link";

interface ChecklistItem {
  label: string;
  completed: boolean;
  href: string;
}

interface DashboardSetupChecklistProps {
  items: ChecklistItem[];
}

export default function DashboardSetupChecklist({ items }: DashboardSetupChecklistProps) {
  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const allDone = completedCount === totalCount;

  if (allDone) return null;

  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">운영 준비 체크리스트</h2>
        <span className="text-xs font-medium text-slate-500">
          {completedCount}/{totalCount} 완료
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-fire-600 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              item.completed
                ? "text-slate-400"
                : "bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item.completed ? (
              <svg
                className="h-5 w-5 shrink-0 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5 shrink-0 text-slate-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
            <span className={item.completed ? "line-through" : "font-medium"}>
              {item.label}
            </span>
            {!item.completed ? (
              <svg
                className="ml-auto h-4 w-4 shrink-0 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
