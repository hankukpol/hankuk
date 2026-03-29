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
    <div className="flex items-center gap-2">
      <p className="text-xs text-slate-500">{subjectName} 체감 난이도</p>
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={`${subjectName}-${option.value}`}
              type="button"
              onClick={() => onChange(option.value)}
              className={`border-r border-slate-300 last:border-r-0 px-3 py-1.5 text-xs font-bold transition ${active
                ? "bg-fire-700 text-white"
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
