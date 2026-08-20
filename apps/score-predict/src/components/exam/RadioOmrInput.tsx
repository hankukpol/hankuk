"use client";

interface RadioOmrInputProps {
  subjectName: string;
  questionCount: number;
  answers: Record<number, number | null>;
  onAnswerChange: (questionNo: number, answer: number | null) => void;
  /** 미입력 문항으로 스크롤할 때 쓰는 DOM id 접두사. 과목명 대신 받아서 공백·특수문자를 피한다. */
  questionIdPrefix?: string;
}

export default function RadioOmrInput({
  subjectName,
  questionCount,
  answers,
  onAnswerChange,
  questionIdPrefix,
}: RadioOmrInputProps) {
  return (
    <div className="grid grid-cols-1 border-l border-t border-slate-200 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: questionCount }, (_, index) => {
        const questionNo = index + 1;
        const selected = answers[questionNo] ?? null;

        return (
          /* 모바일은 번호와 보기를 한 줄에 눕혀 세로 길이를 줄인다. 100문항을 세로로
             쌓으면 문항당 97px씩 9,700px가 되어 스크롤이 12화면을 넘는다.
             sm 이상은 2~5열 그리드라 셀 폭이 좁으므로 기존 세로 배치를 유지한다. */
          <div
            key={`${subjectName}-radio-${questionNo}`}
            id={questionIdPrefix ? `${questionIdPrefix}-${questionNo}` : undefined}
            className={`flex scroll-mt-[140px] flex-row items-center gap-2 border-b border-r px-2 py-1.5 sm:flex-col sm:py-3 ${selected === null ? "border-slate-200 bg-slate-50" : "border-service-200 bg-service-50"
 }`}
          >
            {/* 가로 배치에서는 번호와 보기 버튼이 나란히 놓인다.
                "번"을 떼면 1번 문항의 라벨과 1번 보기가 같은 글자라 헷갈린다. */}
            <span
              className={`w-11 shrink-0 text-right text-sm font-bold tabular-nums sm:w-auto sm:text-center ${selected === null ? "text-slate-400" : "text-service-700"}`}
            >
              {questionNo}번
            </span>
            <div
              role="radiogroup"
              aria-label={`${subjectName} ${questionNo}번`}
              className="flex w-full min-w-0 justify-end gap-2 sm:justify-center"
            >
              {[1, 2, 3, 4].map((choice) => {
                const active = selected === choice;
                return (
                  <button
                    key={`${subjectName}-${questionNo}-${choice}`}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onAnswerChange(questionNo, active ? null : choice)}
                    /* 모바일은 남는 가로 폭을 보기 버튼에 나눠 줘서 터치 정확도를 올린다.
                       sm 이상은 셀이 좁아 44px 고정으로 되돌린다. */
                    className={`h-11 min-w-11 max-w-[72px] flex-1 basis-0 border text-[15px] font-bold transition rounded-none sm:w-11 sm:max-w-none sm:flex-none ${active
 ? "border-service-600 bg-service-600 text-white"
 : "border-slate-300 bg-white text-slate-600 hover:border-service-400 hover:bg-service-50"
 }`}
                    aria-label={`${choice}번`}
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
