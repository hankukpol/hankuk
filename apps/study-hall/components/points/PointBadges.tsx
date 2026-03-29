import { formatPointValue, getPointCategoryClasses, getPointCategoryLabel } from "@/lib/point-meta";

export function PointCategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold ${getPointCategoryClasses(category)}`}
    >
      {getPointCategoryLabel(category)}
    </span>
  );
}

export function PointValueBadge({ points }: { points: number }) {
  return (
    <span
      className={`inline-flex items-center rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold ${
        points > 0
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {formatPointValue(points)}
    </span>
  );
}
