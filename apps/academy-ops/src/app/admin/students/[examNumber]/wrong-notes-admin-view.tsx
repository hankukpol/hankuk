"use client";

import { Subject } from "@prisma/client";
import { SUBJECT_LABEL } from "@/lib/constants";

type WrongNote = {
  id: number;
  memo: string | null;
  createdAt: Date;
  question: {
    id: number;
    questionNo: number;
    correctAnswer: string;
    correctRate: number | null;
    difficulty: string | null;
    questionSession: {
      subject: Subject;
      examType: string;
      examDate: Date;
    };
  };
};

type Props = {
  examNumber: string;
  wrongNotes: WrongNote[];
};

export function WrongNotesAdminView({ examNumber: _examNumber, wrongNotes }: Props) {
  if (wrongNotes.length === 0) {
    return (
      <div className="rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel text-center">
        <p className="text-slate text-sm">오답노트에 저장된 문항이 없습니다.</p>
      </div>
    );
  }

  // Group by subject
  const grouped = wrongNotes.reduce<Record<string, WrongNote[]>>((acc, wn) => {
    const key = wn.question.questionSession.subject;
    if (!acc[key]) acc[key] = [];
    acc[key].push(wn);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">총 {wrongNotes.length}개 문항이 저장되어 있습니다.</p>
      </div>
      {Object.entries(grouped).map(([subject, notes]) => (
        <div key={subject} className="rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
          <div className="px-6 py-4 border-b border-ink/5 flex items-center gap-3">
            <span className="inline-flex rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              {SUBJECT_LABEL[subject as Subject] ?? subject}
            </span>
            <span className="text-xs text-slate">{notes.length}개</span>
          </div>
          <div className="divide-y divide-ink/5">
            {notes.map((wn) => {
              const examDate = new Date(wn.question.questionSession.examDate);
              return (
                <div key={wn.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-ink">
                          {examDate.getFullYear()}년 {examDate.getMonth() + 1}월 {examDate.getDate()}일
                        </span>
                        <span className="text-xs text-slate">
                          {wn.question.questionNo}번
                        </span>
                        {wn.question.correctRate !== null && (
                          <span className="text-xs text-slate">
                            정답률 {wn.question.correctRate.toFixed(1)}%
                          </span>
                        )}
                        {wn.question.difficulty && (
                          <span className="text-xs text-slate">
                            난이도: {wn.question.difficulty}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate">
                        정답: {wn.question.correctAnswer}
                      </p>
                      {wn.memo && (
                        <p className="mt-1 text-xs text-slate bg-mist rounded px-2 py-1">
                          메모: {wn.memo}
                        </p>
                      )}
                    </div>
                    <time className="text-xs text-slate shrink-0">
                      {new Date(wn.createdAt).toLocaleDateString("ko-KR")}
                    </time>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
