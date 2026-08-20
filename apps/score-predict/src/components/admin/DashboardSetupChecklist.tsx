import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";

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
    <section className="admin-page-section">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">운영 준비 체크리스트</h2>
        <span className="text-xs font-medium text-slate-500">
          {completedCount}/{totalCount} 완료
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full origin-left rounded-full bg-service-600 transition-transform duration-500"
          style={{ transform: `scaleX(${progressPercent / 100})` }}
        />
      </div>

      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-3 border-t border-slate-200 px-3 py-3 text-sm transition ${
 item.completed
 ? "text-slate-400"
 : "bg-slate-50 text-slate-700 hover:bg-slate-100"
 }`}
          >
            {item.completed ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
            )}
            <span className={item.completed ? "line-through" : "font-medium"}>
              {item.label}
            </span>
            {!item.completed ? (
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
