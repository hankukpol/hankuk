"use client";

export type OmrInputMode = "quick" | "radio";

interface OmrInputModeToggleProps {
  value: OmrInputMode;
  onChange: (next: OmrInputMode) => void;
}

export default function OmrInputModeToggle({ value, onChange }: OmrInputModeToggleProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-slate-600">입력 방식:</p>
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
        <button
          type="button"
          onClick={() => onChange("quick")}
          className={`border-r last:border-r-0 px-5 py-2.5 text-sm font-bold transition ${value === "quick"
            ? "bg-fire-700 text-white border-fire-700"
            : "bg-white text-slate-700 hover:bg-slate-50 border-transparent"
            }`}
        >
          빠른입력 (키보드)
        </button>
        <button
          type="button"
          onClick={() => onChange("radio")}
          className={`border-r last:border-r-0 px-5 py-2.5 text-sm font-bold transition ${value === "radio"
            ? "bg-fire-700 text-white border-fire-700"
            : "bg-white text-slate-700 hover:bg-slate-50 border-transparent"
            }`}
        >
          OMR 마킹 (터치)
        </button>
      </div>
    </div>
  );
}
