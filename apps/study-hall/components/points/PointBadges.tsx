import { formatPointValue, getPointCategoryClasses, getPointCategoryLabel } from "@/lib/point-meta";

export function PointCategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`admin-status-chip inline-flex items-center rounded-lg border px-3 py-2 text-xs font-semibold ${getPointCategoryClasses(category)}`}
    >
      {getPointCategoryLabel(category)}
    </span>
  );
}

export function PointValueBadge({ points }: { points: number }) {
  return (
    <span
      className={`admin-status-chip inline-flex items-center rounded-lg border px-3 py-2 text-xs font-semibold ${ points > 0 ? "border-admin-success-line bg-admin-success-soft text-admin-success" : "border-admin-danger-line bg-admin-danger-soft text-admin-danger" }`}
    >
      {formatPointValue(points)}
    </span>
  );
}
