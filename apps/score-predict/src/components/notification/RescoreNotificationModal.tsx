"use client";

export interface RescoreNotificationItem {
  notificationId: number;
  rescoreEventId: number;
  examName: string;
  examYear: number;
  examRound: number;
  createdAt: string;
  reason: string | null;
  changedQuestions: Array<{
    subjectName: string;
    questionNumber: number;
    oldAnswer: number | null;
    newAnswer: number;
  }>;
  myScoreChange: {
    oldTotalScore: number;
    newTotalScore: number;
    oldFinalScore: number;
    newFinalScore: number;
    scoreDelta: number;
    oldRank: number | null;
    newRank: number | null;
  };
}

interface RescoreNotificationModalProps {
  open: boolean;
  unreadCount: number;
  notifications: RescoreNotificationItem[];
  onClose: () => void;
  onMarkAsRead: (rescoreEventId: number) => Promise<void>;
  markingEventId: number | null;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("ko-KR");
}

function formatDelta(value: number): string {
  const abs = Math.abs(value).toFixed(2);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return "0.00";
}

export default function RescoreNotificationModal({
  open,
  unreadCount,
  notifications,
  onClose,
  onMarkAsRead,
  markingEventId,
}: RescoreNotificationModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 text-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">정답키 변경 알림</h2>
            <p className="mt-1 text-sm text-slate-500">미읽음 알림 {unreadCount}건</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        {notifications.length < 1 ? (
          <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            확인할 재채점 알림이 없습니다.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {notifications.map((item) => (
              <article key={item.notificationId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {item.examYear}년 {item.examRound}차 · {item.examName}
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
                </div>

                {item.reason ? (
                  <p className="mt-2 text-sm text-slate-700">
                    사유: <span className="font-medium">{item.reason}</span>
                  </p>
                ) : null}

                {item.changedQuestions.length > 0 ? (
                  <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-slate-600">변경 문항</p>
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {item.changedQuestions.map((question) => (
                        <li
                          key={`${item.notificationId}-${question.subjectName}-${question.questionNumber}`}
                          className="rounded border border-slate-100 px-2 py-1"
                        >
                          {question.subjectName} {question.questionNumber}번:{" "}
                          {question.oldAnswer === null ? "-" : question.oldAnswer} → {question.newAnswer}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-700">내 점수 변동</p>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    <p>
                      원점수: {item.myScoreChange.oldTotalScore.toFixed(2)} →{" "}
                      {item.myScoreChange.newTotalScore.toFixed(2)}
                    </p>
                    <p>
                      최종점수: {item.myScoreChange.oldFinalScore.toFixed(2)} →{" "}
                      {item.myScoreChange.newFinalScore.toFixed(2)}
                    </p>
                    <p>
                      순위: {item.myScoreChange.oldRank ?? "-"} → {item.myScoreChange.newRank ?? "-"}
                    </p>
                    <p
                      className={
                        item.myScoreChange.scoreDelta > 0
                          ? "font-semibold text-emerald-700"
                          : item.myScoreChange.scoreDelta < 0
                            ? "font-semibold text-rose-700"
                            : "text-slate-700"
                      }
                    >
                      점수 변화: {formatDelta(item.myScoreChange.scoreDelta)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void onMarkAsRead(item.rescoreEventId)}
                    disabled={markingEventId === item.rescoreEventId}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {markingEventId === item.rescoreEventId ? "처리 중..." : "확인(읽음 처리)"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
