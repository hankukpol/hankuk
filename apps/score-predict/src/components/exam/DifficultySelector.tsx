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
    <div className="w-full">
      <p className="user-card-title">{subjectName} 체감 난이도</p>
      <p className="mt-1 text-[13px] leading-5 text-slate-500">
        선택하시면 다른 응시자들이 느낀 난이도와 비교해 볼 수 있습니다.
      </p>
      <div className="mt-3 grid w-full grid-cols-5 border border-slate-300">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={`${subjectName}-${option.value}`}
              type="button"
              onClick={() => onChange(option.value)}
              className={`min-h-11 border-r border-slate-300 px-2 py-2 text-[13px] font-bold tracking-[-0.05em] transition last:border-r-0 ${active
 ? "bg-service-600 text-white"
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
