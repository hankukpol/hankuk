interface DifficultyBarProps {
  easy: number;
  normal: number;
  hard: number;
}

export default function DifficultyBar({ easy, normal, hard }: DifficultyBarProps) {
  const safeEasy = Math.max(0, Math.min(100, easy));
  const safeNormal = Math.max(0, Math.min(100, normal));
  const safeHard = Math.max(0, Math.min(100, hard));
  const total = safeEasy + safeNormal + safeHard;

  const easyWidth = total > 0 ? (safeEasy / total) * 100 : 0;
  const normalWidth = total > 0 ? (safeNormal / total) * 100 : 0;
  const hardWidth = total > 0 ? (safeHard / total) * 100 : 0;

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
      <div className="flex h-full w-full">
        <div className="bg-emerald-500" style={{ width: `${easyWidth}%` }} />
        <div className="bg-amber-500" style={{ width: `${normalWidth}%` }} />
        <div className="bg-rose-500" style={{ width: `${hardWidth}%` }} />
      </div>
    </div>
  );
}
