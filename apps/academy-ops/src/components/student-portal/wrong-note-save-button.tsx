"use client";

import { useState, useTransition } from "react";

type WrongNoteSaveButtonProps = {
  questionId: number;
  initiallySaved: boolean;
};

export function WrongNoteSaveButton({
  questionId,
  initiallySaved,
}: WrongNoteSaveButtonProps) {
  const [saved, setSaved] = useState(initiallySaved);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveWrongNote() {
    if (saved) {
      return;
    }

    setErrorMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/student/wrong-notes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            questionId,
          }),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "오답 노트 저장에 실패했습니다.");
        }

        setSaved(true);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "오답 노트 저장에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={saveWrongNote}
        disabled={saved || isPending}
        className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold transition ${
          saved
            ? "border border-forest/20 bg-forest/10 text-forest"
            : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
        }`}
      >
        {saved ? "저장됨" : "노트 저장"}
      </button>
      {errorMessage ? <p className="text-xs text-red-700">{errorMessage}</p> : null}
    </div>
  );
}