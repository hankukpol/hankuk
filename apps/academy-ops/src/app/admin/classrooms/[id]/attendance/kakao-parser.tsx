"use client";

import { useState, useTransition } from "react";

// Attendance keywords to detect presence
const ATTENDANCE_KEYWORDS = [
  "동원했습니다",
  "동원",
  "출석합니다",
  "출석했습니다",
  "출석이요",
  "출석",
  "왔습니다",
  "왔어요",
  "자리했습니다",
  "착석했습니다",
  "공부시작",
  "시작합니다",
  "도착",
  "참석",
  "있습니다",
  "자리",
];

const ABSENT_KEYWORDS = [
  "결석합니다",
  "못가겠습니다",
  "결석",
  "빠지겠습니다",
];

export interface KakaoParserProps {
  classroomId: string;
  date: string; // YYYY-MM-DD
  // Note: Student model uses examNumber as PK; id is an alias for examNumber here
  students: Array<{ id: string; name: string; examNumber: string }>;
  onSave: (presentStudentExamNumbers: string[]) => void;
}

interface ParsedLine {
  rawName: string;
  time: string | null;
  attendType: "PRESENT" | "ABSENT";
  matched: { id: string; name: string; examNumber: string } | null;
  isAmbiguous: boolean;
  selected: boolean;
}

// Parse time string "오전 10:02" → "10:02", "오후 3:15" → "15:15"
function parseKoreanTime(ampm: string, time: string): string {
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (ampm === "오후" && h < 12) h += 12;
  if (ampm === "오전" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function findKeyword(
  msg: string,
): { type: "PRESENT" | "ABSENT" } | null {
  for (const kw of ABSENT_KEYWORDS) {
    if (msg.includes(kw)) return { type: "ABSENT" };
  }
  for (const kw of ATTENDANCE_KEYWORDS) {
    if (msg.includes(kw)) return { type: "PRESENT" };
  }
  return null;
}

function matchStudent(
  rawName: string,
  students: Array<{ id: string; name: string; examNumber: string }>,
): { student: { id: string; name: string; examNumber: string } | null; isAmbiguous: boolean } {
  // Strip generation prefix like "52기 홍길동" → "홍길동"
  const cleaned = rawName.replace(/^\d+기\s*/, "").trim();

  const exact = students.filter((s) => s.name === cleaned || s.name === rawName);
  if (exact.length === 1) return { student: exact[0]!, isAmbiguous: false };
  if (exact.length > 1) return { student: null, isAmbiguous: true };

  // Partial match
  const partial = students.filter(
    (s) => s.name.includes(cleaned) || cleaned.includes(s.name),
  );
  if (partial.length === 1) return { student: partial[0]!, isAmbiguous: false };
  if (partial.length > 1) return { student: null, isAmbiguous: true };

  return { student: null, isAmbiguous: false };
}

function parseKakaoText(
  text: string,
  students: Array<{ id: string; name: string; examNumber: string }>,
): { lines: ParsedLine[]; detectedDate: string | null } {
  const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const lines: ParsedLine[] = [];
  let detectedDate: string | null = null;

  // iOS: "2024년 3월 15일 오전 10:02, 홍길동 : 출석합니다"
  const iosPattern =
    /^(\d{4}년\s+\d{1,2}월\s+\d{1,2}일)\s+(오전|오후)\s+(\d{1,2}:\d{2}),\s*(.+?)\s*:\s*(.+)$/;

  // Android: "[홍길동] [오전 10:02] 출석합니다"
  const androidPattern = /^\[(.+?)\]\s*\[(오전|오후)\s+(\d{1,2}:\d{2})\]\s*(.+)$/;

  // Simple format: "홍길동 : 출석합니다" or "오전 10:23 홍길동 : 출석합니다"
  const simplePattern = /^(.+?)\s*:\s*(.+)$/;

  // Date header
  const dateHeaderPattern = /(\d{4})년\s+(\d{1,2})월\s+(\d{1,2})일/;

  const seenExamNumbers = new Set<string>();

  for (const line of rawLines) {
    // Try to extract date
    if (!detectedDate) {
      const dateMatch = line.match(dateHeaderPattern);
      if (dateMatch) {
        const y = dateMatch[1];
        const mo = String(parseInt(dateMatch[2] ?? "1", 10)).padStart(2, "0");
        const d = String(parseInt(dateMatch[3] ?? "1", 10)).padStart(2, "0");
        detectedDate = `${y}-${mo}-${d}`;
      }
    }

    let rawName: string | null = null;
    let time: string | null = null;
    let message: string | null = null;

    // iOS format
    const iosMatch = line.match(iosPattern);
    if (iosMatch) {
      const [, dateStr, ampm, timeStr, name, msg] = iosMatch;
      rawName = name ?? null;
      time = ampm && timeStr ? parseKoreanTime(ampm, timeStr) : null;
      message = msg ?? null;
      if (!detectedDate && dateStr) {
        const dm = dateStr.match(dateHeaderPattern);
        if (dm) {
          const y = dm[1];
          const mo = String(parseInt(dm[2] ?? "1", 10)).padStart(2, "0");
          const d = String(parseInt(dm[3] ?? "1", 10)).padStart(2, "0");
          detectedDate = `${y}-${mo}-${d}`;
        }
      }
    } else {
      // Android format
      const androidMatch = line.match(androidPattern);
      if (androidMatch) {
        const [, name, ampm, timeStr, msg] = androidMatch;
        rawName = name ?? null;
        time = ampm && timeStr ? parseKoreanTime(ampm, timeStr) : null;
        message = msg ?? null;
      } else {
        // Simple "name : message" format
        const simpleMatch = line.match(simplePattern);
        if (simpleMatch) {
          const [, name, msg] = simpleMatch;
          rawName = name?.trim() ?? null;
          message = msg?.trim() ?? null;
        }
      }
    }

    if (!rawName || !message) continue;

    const kwResult = findKeyword(message);
    if (!kwResult) continue;

    const { student, isAmbiguous } = matchStudent(rawName, students);

    // Deduplicate by examNumber
    if (student && seenExamNumbers.has(student.examNumber)) continue;
    if (student) seenExamNumbers.add(student.examNumber);

    lines.push({
      rawName,
      time,
      attendType: kwResult.type,
      matched: student,
      isAmbiguous,
      selected: student !== null && !isAmbiguous && kwResult.type === "PRESENT",
    });
  }

  return { lines, detectedDate };
}

type Step = "paste" | "review" | "done";

export function KakaoParser({ classroomId, date, students, onSave }: KakaoParserProps) {
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("paste");
  const [rawText, setRawText] = useState("");
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [currentDate, setCurrentDate] = useState(date);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  function handleParse() {
    if (!rawText.trim()) {
      setError("카카오톡 채팅 내용을 붙여넣어주세요.");
      return;
    }
    setError(null);
    const { lines: parsed, detectedDate } = parseKakaoText(rawText, students);
    if (parsed.length === 0) {
      setError(
        "출석·결석 키워드가 포함된 메시지를 찾을 수 없습니다. 채팅 내용을 확인해 주세요.",
      );
      return;
    }
    if (detectedDate) setCurrentDate(detectedDate);
    setLines(parsed);
    setStep("review");
  }

  function toggleSelected(idx: number) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, selected: !l.selected } : l)),
    );
  }

  function handleSave() {
    const presentIds = lines
      .filter((l) => l.selected && l.matched && l.attendType === "PRESENT")
      .map((l) => l.matched!.id);

    if (presentIds.length === 0) {
      setError("출석 처리할 학생이 없습니다. 항목을 선택해 주세요.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${classroomId}/attendance/logs/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attendDate: currentDate,
            entries: lines
              .filter((l) => l.selected && l.matched)
              .map((l) => ({
                examNumber: l.matched!.examNumber,
                attendType: l.attendType === "PRESENT" ? "NORMAL" : "ABSENT",
                checkInTime: l.time ?? undefined,
              })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "저장 실패");
        setSavedCount(presentIds.length);
        onSave(presentIds);
        setStep("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  function reset() {
    setStep("paste");
    setRawText("");
    setLines([]);
    setCurrentDate(date);
    setError(null);
    setSavedCount(0);
  }

  const matchedCount = lines.filter((l) => l.matched && !l.isAmbiguous).length;
  const unmatchedCount = lines.filter((l) => !l.matched && !l.isAmbiguous).length;
  const ambiguousCount = lines.filter((l) => l.isAmbiguous).length;
  const selectedCount = lines.filter((l) => l.selected).length;

  // ── Step 1: Paste ──────────────────────────────────────────────────────────
  if (step === "paste") {
    return (
      <div className="space-y-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-base font-semibold text-ink">카카오톡 출결 처리</h2>
          <p className="mt-1 text-xs text-slate">
            카카오 단체채팅방 내용을 붙여넣으면 출석 키워드를 자동으로 인식합니다.
          </p>

          <div className="mt-4">
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              placeholder="카카오 단체채팅방 내용을 여기에 붙여넣으세요..."
              className="w-full resize-none rounded-[12px] border border-ink/20 bg-mist/30 px-4 py-3 text-sm font-mono outline-none focus:border-forest"
            />
          </div>

          {error && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-slate">재적 {students.length}명</p>
            <button
              onClick={handleParse}
              disabled={isPending}
              className="rounded-xl bg-ember px-6 py-2.5 text-sm font-medium text-white hover:bg-ember/90 disabled:opacity-50"
            >
              파싱하기
            </button>
          </div>
        </div>

        {/* 지원 형식 안내 */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-ink/10 bg-mist/50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-slate">iOS 형식</p>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-slate/80">
              {`2024년 3월 15일 오전 10:02, 홍길동 : 출석\n2024년 3월 15일 오전 10:03, 김철수 : 출석합니다`}
            </pre>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-mist/50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-slate">Android 형식</p>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-slate/80">
              {`[홍길동] [오전 10:02] 출석\n[김철수] [오전 10:03] 출석합니다`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Review ─────────────────────────────────────────────────────────
  if (step === "review") {
    const presentLines = lines.filter((l) => l.matched && l.attendType === "PRESENT");
    const absentLines = lines.filter((l) => l.matched && l.attendType === "ABSENT");
    const unknownLines = lines.filter((l) => !l.matched);

    // Students not mentioned in the chat
    const mentionedExamNumbers = new Set(
      lines.filter((l) => l.matched).map((l) => l.matched!.examNumber),
    );
    const notResponded = students.filter(
      (s) => !mentionedExamNumbers.has(s.examNumber),
    );

    return (
      <div className="space-y-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-base font-semibold text-ink">파싱 결과 확인</h2>

          {/* 날짜 */}
          <div className="mt-3 flex items-center gap-3">
            <label className="w-20 shrink-0 text-xs font-semibold text-slate">출결 날짜</label>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>

          {/* 요약 배지 */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              출석 확인 {matchedCount}명
            </span>
            {ambiguousCount > 0 && (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                미확인 {ambiguousCount}명
              </span>
            )}
            {unmatchedCount > 0 && (
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                미매칭 {unmatchedCount}명
              </span>
            )}
            {notResponded.length > 0 && (
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                미응답 {notResponded.length}명
              </span>
            )}
          </div>
        </div>

        {/* 출석 확인 */}
        <div className="rounded-[28px] border border-forest/20 bg-white p-5 shadow-panel">
          <h3 className="mb-3 text-sm font-semibold text-forest">
            출석 확인 ({presentLines.length}명)
          </h3>
          {presentLines.length === 0 ? (
            <p className="text-sm text-slate">출석 확인 학생이 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {presentLines.map((l, idx) => {
                const globalIdx = lines.indexOf(l);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleSelected(globalIdx)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      l.selected
                        ? "border-forest/30 bg-forest/10 text-forest"
                        : "border-ink/10 bg-mist text-slate line-through"
                    }`}
                  >
                    {l.matched?.name ?? l.rawName}
                    {l.time && <span className="ml-1.5 opacity-60">{l.time}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 미확인 (동명이인 또는 미매칭) */}
        {(ambiguousCount > 0 || unmatchedCount > 0) && (
          <div className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-5">
            <h3 className="mb-3 text-sm font-semibold text-amber-800">
              미확인 ({ambiguousCount + unmatchedCount}명) — 수동 처리 필요
            </h3>
            <div className="flex flex-wrap gap-2">
              {unknownLines.map((l, idx) => (
                <span
                  key={idx}
                  className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                >
                  {l.rawName}
                  {l.isAmbiguous && <span className="ml-1 opacity-70">(동명이인)</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 결석 */}
        {absentLines.length > 0 && (
          <div className="rounded-[28px] border border-red-200 bg-red-50/40 p-5">
            <h3 className="mb-3 text-sm font-semibold text-red-800">
              결석 메시지 ({absentLines.length}명)
            </h3>
            <div className="flex flex-wrap gap-2">
              {absentLines.map((l, idx) => {
                const globalIdx = lines.indexOf(l);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleSelected(globalIdx)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      l.selected
                        ? "border-red-300 bg-red-100 text-red-700"
                        : "border-ink/10 bg-mist text-slate line-through"
                    }`}
                  >
                    {l.matched?.name ?? l.rawName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 미응답 */}
        {notResponded.length > 0 && (
          <div className="rounded-[28px] border border-red-200 bg-red-50/40 p-5">
            <h3 className="mb-3 text-sm font-semibold text-red-800">
              미응답 ({notResponded.length}명) — 채팅에서 확인되지 않음
            </h3>
            <div className="flex flex-wrap gap-2">
              {notResponded.map((s) => (
                <span
                  key={s.examNumber}
                  className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600"
                >
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isPending || selectedCount === 0}
            className="rounded-xl bg-ember px-6 py-2.5 text-sm font-medium text-white hover:bg-ember/90 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : `출석 기록 저장 (${selectedCount}명)`}
          </button>
          <button
            onClick={reset}
            className="rounded-xl border border-ink/20 px-5 py-2.5 text-sm text-slate hover:border-ink/40"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Done ───────────────────────────────────────────────────────────
  return (
    <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-10 text-center shadow-panel">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest/10">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 13l4 4L19 7"
            stroke="#1F4D3A"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-forest">출결 기록 저장 완료</h2>
      <p className="mt-2 text-sm text-slate">{savedCount}명의 출결 기록이 저장되었습니다.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-xl border border-ink/20 px-5 py-2.5 text-sm text-slate hover:border-ink/40"
        >
          다시 파싱하기
        </button>
      </div>
    </div>
  );
}
