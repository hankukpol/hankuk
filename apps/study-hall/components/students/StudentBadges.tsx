import {
  getStudentStatusClasses,
  getStudentStatusLabel,
  getWarningStageClasses,
  getWarningStageLabel,
} from "@/lib/student-meta";

export function StudentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold ${getStudentStatusClasses(status)}`}
    >
      {getStudentStatusLabel(status)}
    </span>
  );
}

export function WarningStageBadge({ stage }: { stage: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold ${getWarningStageClasses(stage)}`}
    >
      {getWarningStageLabel(stage)}
    </span>
  );
}

export function TuitionExemptBadge({
  reason,
  className = "",
}: {
  reason?: string | null;
  className?: string;
}) {
  return (
    <span
      title={reason ?? undefined}
      className={`inline-flex items-center rounded-[10px] border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 ${className}`.trim()}
    >
      수납 면제
    </span>
  );
}
