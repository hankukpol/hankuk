"use client";

import { useRef, useState, useTransition } from "react";
import { AttendType, Subject } from "@prisma/client";
import { ATTEND_TYPE_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getScoreSubjectLabel, type ScoreSubjectLabelMap } from "@/lib/scores/subject-filter";

type SessionOption = {
  id: number;
  examType: keyof typeof EXAM_TYPE_LABEL;
  week: number;
  subject: Subject;
  displaySubjectName: string | null;
  examDate: string;
  isCancelled: boolean;
  isLocked: boolean;
};

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  sessions: SessionOption[];
};

type BulkImportFormProps = {
  periods: PeriodOption[];
  subjectLabelMap: ScoreSubjectLabelMap;
};

type ImportResult = {
  success: number;
  created: number;
  updated: number;
  unresolved: number;
  invalid: number;
  skipped: number;
  errors: Array<{ rowNumber: number; raw: string; reason: string }>;
};

type FormState =
  | { type: "idle" }
  | { type: "success"; result: ImportResult }
  | { type: "error"; message: string };

export function BulkImportForm({ periods, subjectLabelMap }: BulkImportFormProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(
    () => periods.find((p) => p.isActive)?.id ?? periods[0]?.id ?? null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [attendType, setAttendType] = useState<AttendType | "">("");
  const [formState, setFormState] = useState<FormState>({ type: "idle" });
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;
  const availableSessions = selectedPeriod?.sessions ?? [];
  const selectedSession =
    availableSessions.find((s) => s.id === selectedSessionId) ?? null;

  function handlePeriodChange(periodId: number) {
    setSelectedPeriodId(periodId);
    setSelectedSessionId(null);
    setFormState({ type: "idle" });
  }

  function handleSessionChange(sessionId: number) {
    setSelectedSessionId(sessionId);
    setFormState({ type: "idle" });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFormState({ type: "error", message: "CSV 파일을 선택해 주세요." });
      return;
    }
    if (!selectedSessionId) {
      setFormState({ type: "error", message: "시험 회차를 선택해 주세요." });
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", String(selectedSessionId));
        if (attendType) formData.append("attendType", attendType);

        const response = await fetch("/api/scores/bulk-import", {
          method: "POST",
          body: formData,
          cache: "no-store",
        });

        const text = await response.text();
        const json = text.trim()
          ? (JSON.parse(text) as { data?: ImportResult; error?: string })
          : {};

        if (!response.ok) {
          setFormState({
            type: "error",
            message: json.error ?? "업로드에 실패했습니다.",
          });
          return;
        }

        if (json.data) {
          setFormState({ type: "success", result: json.data });
          // 파일 인풋 초기화
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      } catch {
        setFormState({ type: "error", message: "네트워크 오류가 발생했습니다." });
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* 형식 안내 */}
      <section className="rounded-[24px] border border-forest/20 bg-forest/5 p-6">
        <h2 className="text-base font-semibold text-forest">CSV 파일 형식 안내</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          아래 형식으로 작성된 CSV 파일을 업로드하세요. 헤더 행은 있어도 없어도 됩니다.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-white p-4 text-xs leading-6 text-ink">
          {`학번,이름,원점수[,응시유형]

예시:
2024001,홍길동,85
2024002,김철수,92,NORMAL
2024003,이영희,0,ABSENT`}
        </pre>
        <div className="mt-3 grid gap-1 text-xs text-slate sm:grid-cols-2">
          <div>
            <span className="font-semibold text-ink">응시유형 값:</span>
            {Object.entries(ATTEND_TYPE_LABEL).map(([key, label]) => (
              <span key={key} className="ml-2">
                {key} ({label})
              </span>
            ))}
          </div>
          <div>
            <span className="font-semibold text-ink">주의:</span> 응시유형 생략 시 아래
            기본값이 적용됩니다.
          </div>
        </div>
      </section>

      {/* 업로드 폼 */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 기간 선택 */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold">기간 선택</label>
          <div className="flex flex-wrap gap-2">
            {periods.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => handlePeriodChange(period.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition
                  ${
                    selectedPeriodId === period.id
                      ? "bg-ink text-white"
                      : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
                  }`}
              >
                {period.name}
                {period.isActive ? (
                  <span className="ml-1.5 text-xs opacity-70">활성</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* 회차 선택 */}
        {availableSessions.length > 0 ? (
          <div className="space-y-2">
            <label className="block text-sm font-semibold">회차 선택</label>
            <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
              <div className="max-h-64 overflow-y-auto divide-y divide-ink/10">
                {availableSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    disabled={session.isCancelled || session.isLocked}
                    onClick={() => handleSessionChange(session.id)}
                    className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition
                      ${
                        selectedSessionId === session.id
                          ? "bg-ink text-white"
                          : session.isCancelled || session.isLocked
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-mist"
                      }`}
                  >
                    <span>
                      <span className="font-semibold">
                        {EXAM_TYPE_LABEL[session.examType]}
                      </span>
                      <span className="mx-2 text-xs opacity-70">·</span>
                      {getScoreSubjectLabel(session.subject, session.displaySubjectName, subjectLabelMap)}
                      <span className="mx-2 text-xs opacity-70">·</span>
                      {session.week}주차
                    </span>
                    <span className="text-xs opacity-70">
                      {formatDate(session.examDate)}
                      {session.isCancelled ? " (취소)" : ""}
                      {session.isLocked ? " (잠금)" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : selectedPeriodId ? (
          <p className="text-sm text-slate">이 기간에 시험 회차가 없습니다.</p>
        ) : null}

        {/* 기본 응시유형 */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold">
            기본 응시유형 <span className="font-normal text-slate">(CSV에 응시유형이 없을 때 적용)</span>
          </label>
          <select
            value={attendType}
            onChange={(e) => setAttendType(e.target.value as AttendType | "")}
            className="rounded-xl border border-ink/10 px-4 py-2 text-sm"
          >
            <option value="">자동 (NORMAL)</option>
            {Object.entries(ATTEND_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {key} ({label})
              </option>
            ))}
          </select>
        </div>

        {/* 파일 선택 */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold">CSV 파일 선택</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="block w-full rounded-xl border border-ink/10 px-4 py-2 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-ember/10 file:px-4 file:py-1 file:text-sm file:font-semibold file:text-ember hover:file:bg-ember/20"
          />
          <p className="text-xs text-slate">.csv 또는 .txt 파일 (UTF-8, 쉼표 구분)</p>
        </div>

        {/* 오류 메시지 */}
        {formState.type === "error" ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {formState.message}
          </div>
        ) : null}

        {/* 업로드 버튼 */}
        <button
          type="submit"
          disabled={isPending || !selectedSessionId}
          className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition
            ${
              isPending || !selectedSessionId
                ? "cursor-not-allowed bg-ink/30"
                : "bg-ember hover:bg-ember/90"
            }`}
        >
          {isPending ? "업로드 중..." : "CSV 일괄 입력"}
        </button>
      </form>

      {/* 결과 */}
      {formState.type === "success" ? (
        <section className="rounded-[24px] border border-forest/20 bg-forest/5 p-6 space-y-4">
          <h2 className="text-base font-semibold text-forest">업로드 완료</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            <article className="rounded-[20px] border border-ink/10 bg-white p-4 text-center">
              <p className="text-xs text-slate">반영 성공</p>
              <p className="mt-2 text-2xl font-semibold text-forest">
                {formState.result.success}
              </p>
            </article>
            <article className="rounded-[20px] border border-ink/10 bg-white p-4 text-center">
              <p className="text-xs text-slate">신규 입력</p>
              <p className="mt-2 text-2xl font-semibold">{formState.result.created}</p>
            </article>
            <article className="rounded-[20px] border border-ink/10 bg-white p-4 text-center">
              <p className="text-xs text-slate">덮어쓰기</p>
              <p className="mt-2 text-2xl font-semibold text-ember">
                {formState.result.updated}
              </p>
            </article>
            <article className="rounded-[20px] border border-ink/10 bg-white p-4 text-center">
              <p className="text-xs text-slate">미매칭</p>
              <p className="mt-2 text-2xl font-semibold text-sky-700">
                {formState.result.unresolved}
              </p>
            </article>
            <article className="rounded-[20px] border border-ink/10 bg-white p-4 text-center">
              <p className="text-xs text-slate">파싱 오류</p>
              <p className="mt-2 text-2xl font-semibold text-red-600">
                {formState.result.skipped}
              </p>
            </article>
          </div>

          {formState.result.errors.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-red-700">
                파싱 오류 행 ({formState.result.errors.length}개)
              </h3>
              <div className="mt-2 overflow-hidden rounded-xl border border-ink/10 bg-white">
                <table className="min-w-full text-xs divide-y divide-ink/10">
                  <thead className="bg-mist text-left">
                    <tr>
                      <th className="px-4 py-2 font-semibold">행 번호</th>
                      <th className="px-4 py-2 font-semibold">원본 내용</th>
                      <th className="px-4 py-2 font-semibold">오류 사유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {formState.result.errors.map((err) => (
                      <tr key={err.rowNumber}>
                        <td className="px-4 py-2">{err.rowNumber}</td>
                        <td className="px-4 py-2 font-mono">{err.raw}</td>
                        <td className="px-4 py-2 text-red-600">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {(formState.result.unresolved > 0 || formState.result.invalid > 0) ? (
            <p className="text-xs text-slate">
              미매칭({formState.result.unresolved}건)과 제외({formState.result.invalid}건)는
              성적 입력 화면에서 수동으로 처리하거나, CSV의 학번을 수정 후 재업로드하세요.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
