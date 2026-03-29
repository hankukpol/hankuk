"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AttendType, ParseMatchStatus } from "@prisma/client";
import { ATTEND_TYPE_LABEL } from "@/lib/constants";

const ATTEND_TYPE_COLOR: Record<AttendType, string> = {
  NORMAL: "bg-forest/10 text-forest border-forest/20",
  LIVE: "bg-sky-50 text-sky-800 border-sky-200",
  EXCUSED: "bg-amber-50 text-amber-800 border-amber-200",
  ABSENT: "bg-red-50 text-red-700 border-red-200",
};

const MATCH_STATUS_COLOR: Record<ParseMatchStatus, string> = {
  MATCHED: "bg-forest/10 text-forest",
  UNMATCHED: "bg-red-50 text-red-600",
  AMBIGUOUS: "bg-amber-50 text-amber-700",
};

const MATCH_STATUS_LABEL: Record<ParseMatchStatus, string> = {
  MATCHED: "매칭",
  UNMATCHED: "미매칭",
  AMBIGUOUS: "동명이인",
};

interface ParsedEntry {
  rawName: string;
  attendType: AttendType;
  checkInTime: string | null;
  matchStatus: ParseMatchStatus;
  examNumber: string | null;
}

interface ParseResult {
  parseId: string;
  parsedDate: string | null;
  entries: ParsedEntry[];
  results: Array<{ id: string; examNumber: string | null; matchStatus: ParseMatchStatus; attendType: AttendType | null }>;
}

type Step = "paste" | "confirm" | "done";

interface Props {
  classroomId: string;
  classroomName: string;
}

export function AttendanceParse({ classroomId, classroomName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("paste");
  const [rawText, setRawText] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, AttendType>>({});
  const [error, setError] = useState<string | null>(null);

  function handleParse() {
    if (!rawText.trim()) {
      setError("카카오톡 채팅 내용을 붙여넣어주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${classroomId}/attendance/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "파싱 실패");
        setParseResult(data);
        setOverrides({});
        setStep("confirm");
      } catch (e) {
        setError(e instanceof Error ? e.message : "파싱 실패");
      }
    });
  }

  function handleConfirm() {
    if (!parseResult) return;

    const entries = parseResult.results
      .filter((r) => r.matchStatus === ParseMatchStatus.MATCHED && r.examNumber)
      .map((r) => ({
        resultId: r.id,
        examNumber: r.examNumber!,
        attendType: overrides[r.id] ?? r.attendType ?? AttendType.NORMAL,
      }));

    if (entries.length === 0) {
      setError("저장할 출석 기록이 없습니다.");
      return;
    }

    const attendDate = parseResult.parsedDate
      ? new Date(parseResult.parsedDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${classroomId}/attendance/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parseId: parseResult.parseId,
            attendDate,
            entries,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "저장 실패");
        setStep("done");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  function reset() {
    setStep("paste");
    setRawText("");
    setParseResult(null);
    setOverrides({});
    setError(null);
  }

  // Step 1: Paste
  if (step === "paste") {
    return (
      <div className="max-w-2xl">
        <div className="rounded-[20px] border border-ink/10 bg-white p-6">
          <h2 className="font-semibold mb-3">1단계: 카카오톡 채팅 내용 붙여넣기</h2>
          <p className="text-xs text-slate mb-4">
            카카오톡 채팅방 → 더보기 → 대화 내보내기 → 텍스트 파일 복사
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={14}
            placeholder={`2026년 3월 13일 금요일\n52기 윤정원\n동원했습니다\n오전 5:51\n\n52기 이민준\n동원했습니다\n오전 6:12\n...`}
            className="w-full rounded-[12px] border border-ink/20 bg-mist/30 px-4 py-3 text-sm font-mono outline-none focus:border-forest resize-none"
          />
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
          <button
            onClick={handleParse}
            disabled={isPending}
            className="mt-4 rounded-[28px] bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-forest disabled:opacity-50"
          >
            {isPending ? "파싱 중…" : "파싱 시작"}
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Confirm
  if (step === "confirm" && parseResult) {
    const matched = parseResult.entries.filter((e) => e.matchStatus === ParseMatchStatus.MATCHED);
    const unmatched = parseResult.entries.filter(
      (e) => e.matchStatus !== ParseMatchStatus.MATCHED,
    );

    return (
      <div className="max-w-2xl">
        <div className="rounded-[20px] border border-ink/10 bg-white p-6">
          <h2 className="font-semibold mb-1">2단계: 파싱 결과 확인</h2>
          {parseResult.parsedDate && (
            <p className="text-sm text-slate mb-4">
              날짜:{" "}
              {new Date(parseResult.parsedDate).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </p>
          )}

          <div className="flex gap-3 text-sm mb-4">
            <span className="text-forest font-medium">매칭 {matched.length}명</span>
            {unmatched.length > 0 && (
              <span className="text-red-600 font-medium">미처리 {unmatched.length}명</span>
            )}
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {parseResult.results.map((r) => {
              const entry = parseResult.entries.find((e) => e.rawName && r.examNumber === e.examNumber);
              const currentType = overrides[r.id] ?? r.attendType ?? AttendType.NORMAL;

              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 rounded-[12px] border px-4 py-2.5 ${
                    r.matchStatus === ParseMatchStatus.MATCHED
                      ? "border-forest/15 bg-forest/5"
                      : "border-red-100 bg-red-50/50"
                  }`}
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${MATCH_STATUS_COLOR[r.matchStatus]}`}
                  >
                    {MATCH_STATUS_LABEL[r.matchStatus]}
                  </span>
                  <span className="text-sm flex-1">
                    {parseResult.entries.find((_, i) => parseResult.results[i]?.id === r.id)?.rawName ??
                      r.examNumber ??
                      "알 수 없음"}
                  </span>
                  {r.matchStatus === ParseMatchStatus.MATCHED && r.attendType && (
                    <select
                      value={currentType}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [r.id]: e.target.value as AttendType }))
                      }
                      className="rounded-[8px] border border-ink/15 bg-white px-2 py-1 text-xs outline-none"
                    >
                      {(Object.keys(ATTEND_TYPE_LABEL) as AttendType[]).map((t) => (
                        <option key={t} value={t}>
                          {ATTEND_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="rounded-[28px] bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-forest disabled:opacity-50"
            >
              {isPending ? "저장 중…" : `${matched.length}명 출결 저장`}
            </button>
            <button
              onClick={reset}
              className="rounded-[28px] border border-ink/20 px-5 py-2.5 text-sm text-slate hover:border-ink/40"
            >
              다시 붙여넣기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Done
  return (
    <div className="max-w-2xl">
      <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-8 text-center">
        <div className="text-4xl mb-3">✓</div>
        <h2 className="font-semibold text-forest text-lg mb-2">출결 저장 완료</h2>
        <p className="text-sm text-slate mb-6">
          파싱된 출결 기록이 담임반 대시보드에 반영되었습니다.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-[28px] border border-ink/20 px-5 py-2.5 text-sm text-slate hover:border-ink/40"
          >
            다시 파싱하기
          </button>
        </div>
      </div>
    </div>
  );
}
