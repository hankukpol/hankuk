"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type TargetType = "examNumber" | "phone";

type StudentLookup = {
  examNumber: string;
  name: string;
  phone: string | null;
  found: boolean;
};

type SendResult = {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
};

// Max character length for free-form message
const MAX_CHARS = 1000;

// ─── Kakao Bubble Preview ─────────────────────────────────────────────────────
function KakaoBubblePreview({ message }: { message: string }) {
  const rendered = message.trim() || "(내용을 입력하세요)";
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-yellow-900">
        알림
      </div>
      <div className="max-w-xs">
        <p className="mb-1 text-xs font-semibold text-ink">학원 안내</p>
        <div className="rounded-[18px] rounded-tl-sm bg-yellow-400 px-4 py-3 shadow-sm">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-yellow-900">
            {rendered}
          </pre>
        </div>
        <p className="mt-1 text-right text-[10px] text-slate">알림톡 미리보기</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ManualNotificationForm() {
  // Target
  const [targetType, setTargetType] = useState<TargetType>("examNumber");
  const [examNumberInput, setExamNumberInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  // Student lookup result
  const [lookup, setLookup] = useState<StudentLookup | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Message
  const [message, setMessage] = useState("");

  // Send state
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // ─── Student lookup ─────────────────────────────────────────────────────
  const handleLookup = useCallback(async () => {
    const examNum = examNumberInput.trim();
    if (!examNum) {
      setLookupError("학번을 입력해 주세요.");
      return;
    }
    setLookupError(null);
    setLookup(null);
    setIsLooking(true);

    try {
      const params = new URLSearchParams({ examNumber: examNum });
      const res = await fetch(`/api/students/lookup?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { examNumber: string; name: string; phone: string | null };
        };
        if (json.data) {
          setLookup({ ...json.data, found: true });
        } else {
          setLookup({ examNumber: examNum, name: "", phone: null, found: false });
        }
      } else {
        setLookup({ examNumber: examNum, name: "", phone: null, found: false });
      }
    } catch {
      setLookupError("학생 조회 중 오류가 발생했습니다.");
    } finally {
      setIsLooking(false);
    }
  }, [examNumberInput]);

  // ─── Validation ─────────────────────────────────────────────────────────
  const validate = useCallback((): string | null => {
    if (targetType === "examNumber") {
      const examNum = examNumberInput.trim();
      if (!examNum) return "학번을 입력해 주세요.";
    } else {
      const phone = phoneInput.replace(/\D/g, "");
      if (phone.length < 10) return "유효한 연락처를 입력해 주세요.";
    }
    if (!message.trim()) return "발송할 메시지를 입력해 주세요.";
    if (message.length > MAX_CHARS)
      return `메시지는 ${MAX_CHARS}자 이내로 입력해 주세요.`;
    return null;
  }, [targetType, examNumberInput, phoneInput, message]);

  // ─── Send ────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    setShowConfirm(false);
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setIsSending(true);
    setSendResult(null);

    try {
      // Build payload — for examNumber mode we send to the API using the
      // existing /api/notifications/send endpoint (manual NOTICE type).
      // For phone mode we send a direct one-off message.
      const payload =
        targetType === "examNumber"
          ? {
              preview: false,
              type: "NOTICE",
              message: message.trim(),
              target: "student",
              examNumbers: [examNumberInput.trim()],
            }
          : {
              preview: false,
              type: "NOTICE",
              message: message.trim(),
              target: "phone",
              phone: phoneInput.replace(/\D/g, ""),
            };

      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as { error?: string } & Partial<SendResult>;

      if (!res.ok || json.error) {
        toast.error(json.error ?? "발송에 실패했습니다.");
        return;
      }

      setSendResult({
        sentCount: json.sentCount ?? 0,
        failedCount: json.failedCount ?? 0,
        skippedCount: json.skippedCount ?? 0,
      });
      // Reset form after success
      setMessage("");
      setExamNumberInput("");
      setPhoneInput("");
      setLookup(null);
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setIsSending(false);
    }
  }, [validate, targetType, examNumberInput, phoneInput, message]);

  // Estimated cost (approx 15 KRW per alimtalk message)
  const estimatedCost = 15;

  return (
    <div className="space-y-6">
      {/* ─── Send Result Banner ─────────────────────────────────────────────── */}
      {sendResult && (
        <div className="rounded-[28px] border border-forest/30 bg-forest/10 p-6">
          <p className="font-semibold text-forest">발송 완료</p>
          <div className="mt-3 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-slate">성공</p>
              <p className="text-2xl font-bold text-forest">{sendResult.sentCount}건</p>
            </div>
            <div>
              <p className="text-xs text-slate">실패</p>
              <p
                className={`text-2xl font-bold ${
                  sendResult.failedCount > 0 ? "text-red-600" : "text-ink"
                }`}
              >
                {sendResult.failedCount}건
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">제외</p>
              <p className="text-2xl font-bold text-ink">{sendResult.skippedCount}건</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSendResult(null)}
            className="mt-4 text-sm text-slate underline hover:text-ink"
          >
            닫기
          </button>
        </div>
      )}

      <div className="rounded-[28px] border border-ink/10 bg-white">
        {/* ─── Section 1: Target ─────────────────────────────────────────────── */}
        <div className="border-b border-ink/10 p-6 sm:p-8">
          <h2 className="mb-4 text-base font-semibold text-ink">1. 수신 대상</h2>

          {/* Target type toggle */}
          <div className="mb-5 inline-flex rounded-full border border-ink/10 bg-mist p-1">
            <button
              type="button"
              onClick={() => {
                setTargetType("examNumber");
                setLookup(null);
                setLookupError(null);
              }}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                targetType === "examNumber"
                  ? "bg-white text-ink shadow-sm"
                  : "text-slate hover:text-ink"
              }`}
            >
              학번으로 조회
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetType("phone");
                setLookup(null);
                setLookupError(null);
              }}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                targetType === "phone"
                  ? "bg-white text-ink shadow-sm"
                  : "text-slate hover:text-ink"
              }`}
            >
              연락처 직접 입력
            </button>
          </div>

          {/* ExamNumber input */}
          {targetType === "examNumber" && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={examNumberInput}
                  onChange={(e) => {
                    setExamNumberInput(e.target.value);
                    setLookup(null);
                    setLookupError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleLookup();
                    }
                  }}
                  placeholder="학번 입력 (예: 2401001)"
                  className="flex-1 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/40 focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
                />
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={isLooking}
                  className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-medium text-ink transition hover:border-ember hover:text-ember disabled:opacity-50"
                >
                  {isLooking ? "조회 중..." : "학생 조회"}
                </button>
              </div>

              {lookupError && (
                <p className="text-xs font-medium text-red-600">{lookupError}</p>
              )}

              {lookup && (
                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    lookup.found
                      ? "border-forest/30 bg-forest/10"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  {lookup.found ? (
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs text-slate">학번</p>
                        <p className="font-mono text-sm font-medium text-ink">
                          {lookup.examNumber}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate">이름</p>
                        <p className="text-sm font-medium text-ink">{lookup.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate">연락처</p>
                        <p className="font-mono text-sm text-slate">
                          {lookup.phone ?? "미등록"}
                        </p>
                      </div>
                      <span className="ml-auto inline-flex rounded-full border border-forest/30 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                        확인됨
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-amber-800">
                      학번 &apos;{lookup.examNumber}&apos;을 찾을 수 없습니다.
                      발송은 가능하지만 학생 기록에 남지 않습니다.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Phone input */}
          {targetType === "phone" && (
            <div className="space-y-2">
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="연락처 입력 (예: 010-1234-5678)"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/40 focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
              />
              <p className="text-xs text-slate">
                * 학생 기록과 연결되지 않습니다. 수신 동의 여부를 확인 후 발송하세요.
              </p>
            </div>
          )}
        </div>

        {/* ─── Section 2: Message ───────────────────────────────────────────────── */}
        <div className="border-b border-ink/10 p-6 sm:p-8">
          <h2 className="mb-4 text-base font-semibold text-ink">2. 메시지 작성</h2>

          <div className="space-y-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={MAX_CHARS}
              placeholder={
                "학생에게 전달할 내용을 입력하세요.\n예) [학원 안내] 홍길동님, 내일 오전 9시 면담 예정입니다. 참석 확인 부탁드립니다."
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/40 focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
            />
            <div className="flex items-center justify-between">
              <p
                className={`text-xs ${
                  message.length > MAX_CHARS * 0.9 ? "font-semibold text-amber-600" : "text-slate"
                }`}
              >
                {message.length.toLocaleString("ko-KR")} / {MAX_CHARS.toLocaleString("ko-KR")}자
              </p>
              <p className="text-xs text-slate">
                예상 비용:{" "}
                <span className="font-medium text-ink">약 {estimatedCost}원</span>
                <span className="ml-1 text-slate/60">(알림톡 1건 기준)</span>
              </p>
            </div>
          </div>

          {/* Kakao preview */}
          <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
            <p className="mb-4 text-xs font-medium text-yellow-700">카카오 알림톡 미리보기</p>
            <KakaoBubblePreview message={message} />
          </div>
        </div>

        {/* ─── Section 3: Send ──────────────────────────────────────────────────── */}
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm text-slate">
                수신 대상:{" "}
                <span className="font-medium text-ink">
                  {targetType === "examNumber"
                    ? lookup?.found
                      ? `${lookup.name} (${lookup.examNumber})`
                      : examNumberInput.trim() || "미입력"
                    : phoneInput.trim() || "미입력"}
                </span>
              </p>
              <p className="text-xs text-slate">
                유형: <span className="font-medium text-ink">일반 공지 (NOTICE)</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const err = validate();
                if (err) {
                  toast.error(err);
                  return;
                }
                setShowConfirm(true);
              }}
              disabled={isSending}
              className="inline-flex items-center rounded-full bg-ember px-8 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
            >
              {isSending ? "발송 중..." : "발송"}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Confirm Modal ──────────────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
            <h3 className="text-lg font-semibold text-ink">알림 발송 확인</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate">
              수신 대상:{" "}
              <span className="font-semibold text-ink">
                {targetType === "examNumber"
                  ? lookup?.found
                    ? `${lookup.name} (${lookup.examNumber})`
                    : examNumberInput.trim()
                  : phoneInput.trim()}
              </span>
            </p>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-2xl border border-ink/10 bg-mist px-4 py-3">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
                {message.trim()}
              </pre>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800">
                발송 후 취소할 수 없습니다. 내용과 수신자를 다시 한번 확인해 주세요.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-full border border-ink/20 bg-white py-3 text-sm font-medium text-ink transition hover:border-ink/40"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSend}
                className="flex-1 rounded-full bg-ember py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
              >
                발송
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
