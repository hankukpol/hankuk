import { StudentStatus } from "@prisma/client";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";

type StatusBadgeProps = {
  status: StudentStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
