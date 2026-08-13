"use client";

export type DifficultyRating = "VERY_EASY" | "EASY" | "NORMAL" | "HARD" | "VERY_HARD";

interface DifficultySelectorProps {
  subjectName: string;
  value: DifficultyRating | null;
  onChange: (next: DifficultyRating) => void;
}

const options: Array<{
  value: DifficultyRating;
  label: string;
}> = [
    {
      value: "VERY_EASY",
      label: "매우 쉬움",
    },
    {
      value: "EASY",
      label: "쉬움",
    },
    {
      value: "NORMAL",
      label: "보통",
    },
    {
      value: "HARD",
      label: "어려움",
    },
    {
      value: "VERY_HARD",
      label: "매우 어려움",
    },
  ];

export default function DifficultySelector({ subjectName, value, onChange }: DifficultySelectorProps) {
  return (
    <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center">
      <p className="shrink-0 text-xs text-slate-500">{subjectName} 체감 난이도</p>
      <div className="grid w-full grid-cols-5 overflow-hidden rounded-md border border-slate-300 sm:w-auto">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={`${subjectName}-${option.value}`}
              type="button"
              onClick={() => onChange(option.value)}
              className={`min-h-9 border-r border-slate-300 px-1 py-1.5 text-[11px] font-bold transition last:border-r-0 sm:px-3 sm:text-xs ${active
 ? "bg-service-700 text-white"
 : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
 }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
