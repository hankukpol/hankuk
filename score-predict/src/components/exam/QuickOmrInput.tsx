"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface QuickOmrInputProps {
  subjectName: string;
  questionCount: number;
  answers: Record<number, number | null>;
  onAnswerChange: (questionNo: number, answer: number | null) => void;
  focusToken?: number;
  onRequestNextSubject?: () => void;
}

const cellStyles = {
  empty: "border border-slate-300 bg-white text-slate-700",
  filled: "border border-red-600 bg-red-600 text-white font-semibold",
  focused: "border-2 border-red-500 bg-red-50 text-slate-900 ring-2 ring-red-100",
};

function isValidAnswerKey(value: string): boolean {
  return value === "1" || value === "2" || value === "3" || value === "4";
}

export default function QuickOmrInput({
  subjectName,
  questionCount,
  answers,
  onAnswerChange,
  focusToken = 0,
  onRequestNextSubject,
}: QuickOmrInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedQuestion, setFocusedQuestion] = useState<number | null>(null);

  const questions = useMemo(() => {
    return Array.from({ length: questionCount }, (_, index) => index + 1);
  }, [questionCount]);

  function focusQuestion(questionNo: number) {
    if (questionNo < 1 || questionNo > questionCount) return;
    inputRefs.current[questionNo - 1]?.focus();
  }

  function moveToNext(questionNo: number) {
    if (questionNo < questionCount) {
      focusQuestion(questionNo + 1);
      return;
    }

    if (onRequestNextSubject) {
      onRequestNextSubject();
    }
  }

  function handleAnswerInput(questionNo: number, rawValue: string) {
    const normalized = rawValue.trim();

    if (!normalized) {
      onAnswerChange(questionNo, null);
      return;
    }

    const oneChar = normalized.slice(-1);
    if (!isValidAnswerKey(oneChar)) {
      return;
    }

    onAnswerChange(questionNo, Number(oneChar));
    moveToNext(questionNo);
  }

  function handleKeyDown(questionNo: number, event: React.KeyboardEvent<HTMLInputElement>) {
    const key = event.key;

    if (isValidAnswerKey(key)) {
      event.preventDefault();
      onAnswerChange(questionNo, Number(key));
      moveToNext(questionNo);
      return;
    }

    if (key === "Backspace") {
      event.preventDefault();
      if (answers[questionNo] === null) {
        focusQuestion(questionNo - 1);
      } else {
        onAnswerChange(questionNo, null);
      }
      return;
    }

    if (key === "ArrowLeft") {
      event.preventDefault();
      focusQuestion(questionNo - 1);
      return;
    }

    if (key === "ArrowRight" || key === "Enter") {
      event.preventDefault();
      focusQuestion(questionNo + 1);
      return;
    }

    if (key === "Tab") {
      return;
    }

    event.preventDefault();
  }

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, [focusToken]);

  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      {questions.map((questionNo) => {
        const value = answers[questionNo];
        const isFocused = focusedQuestion === questionNo;
        const styleClass = isFocused
          ? cellStyles.focused
          : value === null
            ? cellStyles.empty
            : cellStyles.filled;

        return (
          <div key={`${subjectName}-${questionNo}`} className="flex flex-col items-center gap-1.5">
            <label
              htmlFor={`${subjectName}-quick-${questionNo}`}
              className="text-xs font-semibold text-slate-500"
            >
              {questionNo}
            </label>
            <input
              id={`${subjectName}-quick-${questionNo}`}
              ref={(element) => {
                inputRefs.current[questionNo - 1] = element;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={value ?? ""}
              onChange={(event) => handleAnswerInput(questionNo, event.target.value)}
              onKeyDown={(event) => handleKeyDown(questionNo, event)}
              onFocus={() => setFocusedQuestion(questionNo)}
              onBlur={() => setFocusedQuestion((prev) => (prev === questionNo ? null : prev))}
              className={`h-9 w-9 rounded-none text-center text-sm outline-none transition ${styleClass}`}
              aria-label={`${subjectName} ${questionNo}번 답안`}
            />
          </div>
        );
      })}
    </div>
  );
}
