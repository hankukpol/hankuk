"use client";

interface RadioOmrInputProps {
  subjectName: string;
  questionCount: number;
  answers: Record<number, number | null>;
  onAnswerChange: (questionNo: number, answer: number | null) => void;
}

export default function RadioOmrInput({
  subjectName,
  questionCount,
  answers,
  onAnswerChange,
}: RadioOmrInputProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: questionCount }, (_, index) => {
        const questionNo = index + 1;
        const selected = answers[questionNo];

        return (
          <div
            key={`${subjectName}-radio-${questionNo}`}
            className={`flex flex-col items-center gap-2 border px-2 py-3 ${selected === null ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white"
              }`}
          >
            <span className="text-sm font-semibold text-slate-900">{questionNo}번</span>
            <div className="flex w-full justify-center gap-1.5">
              {[1, 2, 3, 4].map((choice) => {
                const active = selected === choice;
                return (
                  <button
                    key={`${subjectName}-${questionNo}-${choice}`}
                    type="button"
                    onClick={() => onAnswerChange(questionNo, active ? null : choice)}
                    className={`h-10 w-10 border text-sm font-bold transition rounded-none ${active
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-red-400 hover:bg-red-50"
                      }`}
                    aria-label={`${subjectName} ${questionNo}번 ${choice}번 선택`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
