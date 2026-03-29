"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClassroomStudentInfo } from "./page";

// 출석 키워드 목록 (attendance-keywords 설정 페이지와 동기화)
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
];

const ABSENT_KEYWORDS = [
  "결석합니다",
  "못가겠습니다",
  "결석",
  "빠지겠습니다",
];

interface ParsedEntry {
  rawName: string;
  time: string | null;
  keyword: string;
  attendType: "NORMAL" | "ABSENT";
  matchedStudent: ClassroomStudentInfo | null;
  selected: boolean;
  // For ambiguous (multiple name matches)
  isAmbiguous: boolean;
}

interface Props {
  classroomId: string;
  classroomName: string;
  students: ClassroomStudentInfo[];
}

// Parse time string "오전 10:02" / "오후 3:15" → "10:02" / "15:15"
function parseKoreanTime(ampm: string, time: string): string {
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (ampm === "오후" && h < 12) h += 12;
  if (ampm === "오전" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Extract date from iOS format header line: "2024년 3월 15일 금요일" or "2024년 3월 15일 오전 10:02"
function extractDateFromLine(line: string): string | null {
  const m = line.match(/(\d{4})년\s+(\d{1,2})월\s+(\d{1,2})일/);
  if (!m) return null;
  const y = m[1];
  const mo = String(parseInt(m[2], 10)).padStart(2, "0");
  const d = String(parseInt(m[3], 10)).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function findKeyword(msg: string): { keyword: string; type: "NORMAL" | "ABSENT" } | null {
  // Check absent first (more specific)
  for (const kw of ABSENT_KEYWORDS) {
    if (msg.includes(kw)) return { keyword: kw, type: "ABSENT" };
  }
  for (const kw of ATTENDANCE_KEYWORDS) {
    if (msg.includes(kw)) return { keyword: kw, type: "NORMAL" };
  }
  return null;
}

function matchStudent(
  rawName: string,
  students: ClassroomStudentInfo[],
): { student: ClassroomStudentInfo | null; isAmbiguous: boolean } {
  // Try to strip generation prefix like "52기 홍길동" → "홍길동"
  const cleaned = rawName.replace(/^\d+기\s*/, "").trim();

  const exact = students.filter((s) => s.name === cleaned || s.name === rawName);
  if (exact.length === 1) return { student: exact[0], isAmbiguous: false };
  if (exact.length > 1) return { student: null, isAmbiguous: true };

  // Partial match (name contains the raw name or vice versa)
  const partial = students.filter(
    (s) => s.name.includes(cleaned) || cleaned.includes(s.name),
  );
  if (partial.length === 1) return { student: partial[0], isAmbiguous: false };
  if (partial.length > 1) return { student: null, isAmbiguous: true };

  return { student: null, isAmbiguous: false };
}

function parseKakaoChat(text: string, students: ClassroomStudentInfo[]): {
  entries: ParsedEntry[];
  detectedDate: string | null;
} {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: ParsedEntry[] = [];
  let detectedDate: string | null = null;

  // iOS pattern: "2024년 3월 15일 오전 10:02, 홍길동 : 출석"
  const iosPattern =
    /^(\d{4}년\s+\d{1,2}월\s+\d{1,2}일)\s+(오전|오후)\s+(\d{1,2}:\d{2}),\s*(.+?)\s*:\s*(.+)$/;

  // Android pattern: "[홍길동] [오전 10:02] 출석"
  const androidPattern = /^\[(.+?)\]\s*\[(오전|오후)\s+(\d{1,2}:\d{2})\]\s*(.+)$/;

  // Date-only header lines (iOS export sometimes has these)
  const dateHeaderPattern = /^\d{4}년\s+\d{1,2}월\s+\d{1,2}일/;

  for (const line of lines) {
    // Try to extract date from header lines
    if (dateHeaderPattern.test(line) && !detectedDate) {
      const d = extractDateFromLine(line);
      if (d) detectedDate = d;
    }

    // Try iOS format
    const iosMatch = line.match(iosPattern);
    if (iosMatch) {
      const [, dateStr, ampm, timeStr, rawName, message] = iosMatch;
      if (!detectedDate) {
        const d = extractDateFromLine(dateStr);
        if (d) detectedDate = d;
      }
      const kwResult = findKeyword(message);
      if (!kwResult) continue;
      const parsedTime = parseKoreanTime(ampm, timeStr);
      const { student, isAmbiguous } = matchStudent(rawName, students);
      entries.push({
        rawName,
        time: parsedTime,
        keyword: kwResult.keyword,
        attendType: kwResult.type,
        matchedStudent: student,
        selected: student !== null && !isAmbiguous,
        isAmbiguous,
      });
      continue;
    }

    // Try Android format
    const androidMatch = line.match(androidPattern);
    if (androidMatch) {
      const [, rawName, ampm, timeStr, message] = androidMatch;
      const kwResult = findKeyword(message);
      if (!kwResult) continue;
      const parsedTime = parseKoreanTime(ampm, timeStr);
      const { student, isAmbiguous } = matchStudent(rawName, students);
      entries.push({
        rawName,
        time: parsedTime,
        keyword: kwResult.keyword,
        attendType: kwResult.type,
        matchedStudent: student,
        selected: student !== null && !isAmbiguous,
        isAmbiguous,
      });
    }
  }

  // Deduplicate by student examNumber (keep first occurrence)
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    if (!e.matchedStudent) return true;
    if (seen.has(e.matchedStudent.examNumber)) return false;
    seen.add(e.matchedStudent.examNumber);
    return true;
  });

  return { entries: deduped, detectedDate };
}

type Step = "paste" | "review" | "done";

export function KakaoChatParser({ classroomId, classroomName, students }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("paste");
  const [rawText, setRawText] = useState("");
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [detectedDate, setDetectedDate] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  function handleParse() {
    const text = rawText.trim();
    if (!text) {
      setError("카카오톡 채팅 내용을 붙여넣어주세요.");
      return;
    }
    setError(null);
    const result = parseKakaoChat(text, students);
    if (result.entries.length === 0) {
      setError(
        "출석·결석 키워드가 포함된 메시지를 찾을 수 없습니다. 채팅 내용을 확인해 주세요.",
      );
      return;
    }
    setEntries(result.entries);
    if (result.detectedDate) {
      setDetectedDate(result.detectedDate);
      setManualDate(result.detectedDate);
    }
    setStep("review");
  }

  function toggleSelected(idx: number) {
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, selected: !e.selected } : e)),
    );
  }

  function toggleAttendType(idx: number) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === idx
          ? { ...e, attendType: e.attendType === "NORMAL" ? "ABSENT" : "NORMAL" }
          : e,
      ),
    );
  }

  function selectAll() {
    setEntries((prev) => prev.map((e) => ({ ...e, selected: e.matchedStudent !== null && !e.isAmbiguous })));
  }
  function selectNone() {
    setEntries((prev) => prev.map((e) => ({ ...e, selected: false })));
  }

  function handleConfirm() {
    const selected = entries.filter((e) => e.selected && e.matchedStudent);
    if (selected.length === 0) {
      setError("처리할 항목이 없습니다. 항목을 선택하세요.");
      return;
    }
    setError(null);

    const payload = {
      attendDate: manualDate,
      entries: selected.map((e) => ({
        examNumber: e.matchedStudent!.examNumber,
        attendType: e.attendType,
        checkInTime: e.time ?? undefined,
      })),
    };

    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${classroomId}/attendance/logs/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "저장 실패");
        setSavedCount(selected.length);
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
    setEntries([]);
    setDetectedDate(null);
    setError(null);
    setSavedCount(0);
  }

  const matchedCount = entries.filter((e) => e.matchedStudent && !e.isAmbiguous).length;
  const unmatchedCount = entries.filter((e) => !e.matchedStudent && !e.isAmbiguous).length;
  const ambiguousCount = entries.filter((e) => e.isAmbiguous).length;
  const selectedCount = entries.filter((e) => e.selected).length;

  // Step 1: Paste
  if (step === "paste") {
    return (
      <div className="max-w-2xl">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="font-semibold text-ink mb-1">1단계: 채팅 내용 붙여넣기</h2>
          <p className="text-xs text-slate mb-4">
            카카오톡 채팅방 → 더보기 → 대화 내보내기 → 텍스트 파일 복사 후 붙여넣기
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={14}
            placeholder={`2024년 3월 15일 금요일\n2024년 3월 15일 오전 10:02, 홍길동 : 출석\n2024년 3월 15일 오전 10:03, 김철수 : 출석합니다\n\n또는 Android 형식:\n[홍길동] [오전 10:02] 출석\n[김철수] [오전 10:03] 출석합니다`}
            className="w-full rounded-[12px] border border-ink/20 bg-mist/30 px-4 py-3 text-sm font-mono outline-none focus:border-forest resize-none"
          />
          {error && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-slate">
              재적 {students.length}명 / 담임반: {classroomName}
            </p>
            <button
              onClick={handleParse}
              disabled={isPending}
              className="rounded-xl bg-ember px-6 py-2.5 text-sm font-medium text-white hover:bg-ember/90 disabled:opacity-50"
            >
              파싱 시작
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Review
  if (step === "review") {
    return (
      <div className="max-w-3xl">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="font-semibold text-ink mb-1">2단계: 파싱 결과 확인</h2>

          {/* 날짜 설정 */}
          <div className="mt-3 flex items-center gap-3">
            <label className="text-xs font-semibold text-slate w-20 shrink-0">출결 날짜</label>
            <input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
            {detectedDate && detectedDate !== manualDate && (
              <button
                onClick={() => setManualDate(detectedDate)}
                className="text-xs text-forest underline"
              >
                감지된 날짜 사용 ({detectedDate})
              </button>
            )}
            {detectedDate === manualDate && (
              <span className="text-xs text-forest">채팅에서 자동 감지됨</span>
            )}
          </div>

          {/* 요약 */}
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              매칭 {matchedCount}명
            </span>
            {unmatchedCount > 0 && (
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                미매칭 {unmatchedCount}명
              </span>
            )}
            {ambiguousCount > 0 && (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                동명이인 {ambiguousCount}명
              </span>
            )}
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
              선택 {selectedCount}명
            </span>
          </div>

          {/* 전체 선택 / 해제 */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-forest underline hover:no-underline"
            >
              전체 선택
            </button>
            <span className="text-slate/40 text-xs">|</span>
            <button
              onClick={selectNone}
              className="text-xs text-slate underline hover:no-underline"
            >
              전체 해제
            </button>
          </div>

          {/* 결과 테이블 */}
          <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead className="bg-mist/80">
                <tr>
                  <th className="w-10 px-3 py-3 text-center text-xs font-semibold text-slate">선택</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate">이름 (원문)</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate">시간</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate">키워드</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate">출결 유형</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate">매칭</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {entries.map((entry, idx) => (
                  <tr
                    key={idx}
                    className={`transition ${
                      entry.selected
                        ? "bg-forest/5"
                        : entry.isAmbiguous
                          ? "bg-amber-50/40"
                          : !entry.matchedStudent
                            ? "bg-red-50/30"
                            : "bg-white hover:bg-mist/30"
                    }`}
                  >
                    {/* 선택 체크박스 */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        disabled={!entry.matchedStudent || entry.isAmbiguous}
                        onChange={() => toggleSelected(idx)}
                        className="accent-forest w-4 h-4 disabled:opacity-30"
                      />
                    </td>
                    {/* 이름 */}
                    <td className="px-3 py-3">
                      <div className="font-medium text-ink">{entry.rawName}</div>
                      {entry.matchedStudent && (
                        <div className="text-xs text-slate mt-0.5">
                          {entry.matchedStudent.name}
                          {entry.matchedStudent.generation && (
                            <span className="ml-1">{entry.matchedStudent.generation}기</span>
                          )}
                          <span className="ml-1 font-mono">{entry.matchedStudent.examNumber}</span>
                        </div>
                      )}
                    </td>
                    {/* 시간 */}
                    <td className="px-3 py-3 text-slate font-mono text-xs">
                      {entry.time ?? "-"}
                    </td>
                    {/* 키워드 */}
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full bg-ink/5 px-2 py-0.5 text-xs font-mono text-slate">
                        {entry.keyword}
                      </span>
                    </td>
                    {/* 출결 유형 토글 */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggleAttendType(idx)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border transition ${
                          entry.attendType === "NORMAL"
                            ? "bg-forest/10 border-forest/20 text-forest"
                            : "bg-red-50 border-red-200 text-red-600"
                        }`}
                      >
                        {entry.attendType === "NORMAL" ? "출석" : "결석"}
                      </button>
                    </td>
                    {/* 매칭 상태 */}
                    <td className="px-3 py-3 text-center">
                      {entry.isAmbiguous ? (
                        <span className="inline-flex rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          동명이인
                        </span>
                      ) : entry.matchedStudent ? (
                        <span className="inline-flex rounded-full bg-forest/10 border border-forest/20 px-2 py-0.5 text-xs font-semibold text-forest">
                          매칭
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-600">
                          미매칭
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 미매칭/동명이인 안내 */}
          {(unmatchedCount > 0 || ambiguousCount > 0) && (
            <div className="mt-4 rounded-[16px] border border-amber-200 bg-amber-50/60 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800">처리 불가 항목 안내</p>
              <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
                {unmatchedCount > 0 && (
                  <li>
                    · 미매칭 {unmatchedCount}명 — 담임반 명단에 없는 이름입니다. 수동으로 처리하세요.
                  </li>
                )}
                {ambiguousCount > 0 && (
                  <li>
                    · 동명이인 {ambiguousCount}명 — 같은 이름의 학생이 여러 명입니다.
                    수동으로 처리하세요.
                  </li>
                )}
              </ul>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* 버튼 */}
          <div className="mt-5 flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={isPending || selectedCount === 0}
              className="rounded-xl bg-ember px-6 py-2.5 text-sm font-medium text-white hover:bg-ember/90 disabled:opacity-50"
            >
              {isPending ? "저장 중..." : `${selectedCount}명 출결 처리`}
            </button>
            <button
              onClick={reset}
              className="rounded-xl border border-ink/20 px-5 py-2.5 text-sm text-slate hover:border-ink/40"
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
        <h2 className="text-xl font-semibold text-forest">출결 처리 완료</h2>
        <p className="mt-2 text-sm text-slate">
          {savedCount}명의 출결 기록이 저장되었습니다.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl border border-ink/20 px-5 py-2.5 text-sm text-slate hover:border-ink/40"
          >
            다시 파싱하기
          </button>
          <a
            href={`/admin/classrooms/${classroomId}`}
            className="rounded-xl bg-ember px-5 py-2.5 text-sm font-medium text-white hover:bg-ember/90"
          >
            담임반으로 이동
          </a>
        </div>
      </div>
    </div>
  );
}
