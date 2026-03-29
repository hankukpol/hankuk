"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type RecipientType = "individual" | "cohort" | "all-active";
type MessageType = "INFO" | "WARNING" | "REMINDER";
type Channel = "ALIMTALK" | "SMS" | "WEB_PUSH";

type StudentPreview = {
  examNumber: string;
  name: string;
  phone: string | null;
};

type Cohort = {
  id: string;
  name: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RECIPIENT_LABELS: Record<RecipientType, string> = {
  individual: "개별 학생",
  cohort: "기수 전체",
  "all-active": "전체 재학생",
};

const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  INFO: "일반 공지",
  WARNING: "경고 안내",
  REMINDER: "리마인더",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  ALIMTALK: "카카오 알림톡",
  SMS: "문자 메시지 (SMS)",
  WEB_PUSH: "웹 푸시 알림",
};

const CHANNEL_DELIVERY: Record<Channel, string> = {
  ALIMTALK: "약 1~3분",
  SMS: "약 1~5분",
  WEB_PUSH: "즉시 (앱 설치 필요)",
};

const MESSAGE_TYPE_PREVIEW_COLOR: Record<MessageType, string> = {
  INFO: "border-forest/30 bg-forest/5",
  WARNING: "border-amber-300 bg-amber-50",
  REMINDER: "border-sky-300 bg-sky-50",
};

const MESSAGE_TYPE_TEXT_COLOR: Record<MessageType, string> = {
  INFO: "text-forest",
  WARNING: "text-amber-700",
  REMINDER: "text-sky-700",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ComposeForm() {
  const router = useRouter();

  // Form state
  const [recipientType, setRecipientType] = useState<RecipientType>("individual");
  const [examNumberSearch, setExamNumberSearch] = useState("");
  const [selectedExamNumber, setSelectedExamNumber] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("INFO");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<Channel>("ALIMTALK");

  // UI state
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [searchResults, setSearchResults] = useState<StudentPreview[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [previewStudents, setPreviewStudents] = useState<StudentPreview[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Load cohorts on mount
  useEffect(() => {
    void fetch("/api/admin/notifications/compose")
      .then((r) => r.json())
      .then((json: { data: { cohorts?: Cohort[] } }) => {
        if (json.data.cohorts) setCohorts(json.data.cohorts);
      });
  }, []);

  // Fetch recipient count when selection changes
  const fetchRecipientCount = useCallback(async () => {
    if (recipientType === "individual" && !selectedExamNumber) {
      setRecipientCount(0);
      setPreviewStudents([]);
      return;
    }
    if (recipientType === "cohort" && !cohortId) {
      setRecipientCount(0);
      setPreviewStudents([]);
      return;
    }

    setLoadingRecipients(true);
    try {
      const params = new URLSearchParams({ recipientType });
      if (recipientType === "individual") params.set("examNumber", selectedExamNumber);
      if (recipientType === "cohort") params.set("cohortId", cohortId);

      const res = await fetch(`/api/admin/notifications/compose?${params}`);
      const json = (await res.json()) as {
        data: { count: number; students: StudentPreview[] };
      };
      setRecipientCount(json.data.count);
      setPreviewStudents(json.data.students ?? []);
    } finally {
      setLoadingRecipients(false);
    }
  }, [recipientType, selectedExamNumber, cohortId]);

  useEffect(() => {
    void fetchRecipientCount();
  }, [fetchRecipientCount]);

  // Search students
  useEffect(() => {
    if (recipientType !== "individual" || examNumberSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void fetch(
        `/api/admin/notifications/compose?recipientType=individual&examNumber=${encodeURIComponent(examNumberSearch)}`,
      )
        .then((r) => r.json())
        .then((json: { data: { students: StudentPreview[] } }) => {
          setSearchResults(json.data.students ?? []);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [examNumberSearch, recipientType]);

  function handleSelectStudent(student: StudentPreview) {
    setSelectedExamNumber(student.examNumber);
    setExamNumberSearch(`${student.examNumber} — ${student.name}`);
    setSearchResults([]);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload = {
        recipientType,
        examNumber: recipientType === "individual" ? selectedExamNumber : undefined,
        cohortId: recipientType === "cohort" ? cohortId : undefined,
        messageType,
        title,
        body,
        channel,
      };
      const res = await fetch("/api/admin/notifications/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        data?: { queued: number; total: number };
        error?: string;
      };
      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "발송 처리 중 오류가 발생했습니다.");
      } else {
        setSuccessMsg(
          `${json.data!.queued}명에게 알림이 발송 대기열에 추가되었습니다. (전체 ${json.data!.total}명 중)`,
        );
        setConfirmed(false);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    recipientCount > 0 &&
    !submitting;

  const fullPreviewMsg =
    title.trim() && body.trim()
      ? `[${title.trim()}] ${body.trim()}`
      : "(제목과 내용을 입력하면 미리보기가 표시됩니다)";

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
      {/* ── Left: Form ───────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {successMsg && (
          <div className="rounded-[16px] border border-forest/30 bg-forest/5 px-5 py-4 text-sm text-forest">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-[16px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Recipient Type */}
        <div className="rounded-[24px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-sm font-semibold text-ink">수신자 설정</h2>

          <div className="flex flex-wrap gap-2 mb-5">
            {(["individual", "cohort", "all-active"] as RecipientType[]).map((rt) => (
              <button
                key={rt}
                onClick={() => {
                  setRecipientType(rt);
                  setSelectedExamNumber("");
                  setExamNumberSearch("");
                  setSearchResults([]);
                  setConfirmed(false);
                }}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  recipientType === rt
                    ? "border-forest bg-forest text-white"
                    : "border-ink/20 bg-white text-slate hover:border-forest/40"
                }`}
              >
                {RECIPIENT_LABELS[rt]}
              </button>
            ))}
          </div>

          {/* Individual search */}
          {recipientType === "individual" && (
            <div className="relative">
              <label className="mb-2 block text-xs font-medium text-slate">
                학번 또는 이름 검색
              </label>
              <input
                type="text"
                value={examNumberSearch}
                onChange={(e) => {
                  setExamNumberSearch(e.target.value);
                  if (selectedExamNumber) setSelectedExamNumber("");
                }}
                placeholder="학번 또는 이름 입력..."
                className="w-full rounded-2xl border border-ink/15 px-4 py-3 text-sm text-ink outline-none placeholder:text-slate/40 focus:border-forest focus:ring-1 focus:ring-forest/20 transition"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-2xl border border-ink/10 bg-white shadow-lg overflow-hidden">
                  {searchResults.map((s) => (
                    <button
                      key={s.examNumber}
                      onClick={() => handleSelectStudent(s)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-mist/60 transition"
                    >
                      <span className="font-mono text-ember">{s.examNumber}</span>
                      <span className="font-medium text-ink">{s.name}</span>
                      <span className="ml-auto text-xs text-slate">{s.phone ?? "—"}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedExamNumber && (
                <p className="mt-2 text-xs text-forest">
                  선택됨: {selectedExamNumber}
                </p>
              )}
            </div>
          )}

          {/* Cohort selector */}
          {recipientType === "cohort" && (
            <div>
              <label className="mb-2 block text-xs font-medium text-slate">
                기수 선택
              </label>
              <select
                value={cohortId}
                onChange={(e) => {
                  setCohortId(e.target.value);
                  setConfirmed(false);
                }}
                className="w-full rounded-2xl border border-ink/15 px-4 py-3 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/20 transition"
              >
                <option value="">기수를 선택하세요</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recipient count */}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-slate">선택된 수신자:</span>
            <span
              className={`font-bold text-sm ${
                recipientCount > 0 ? "text-forest" : "text-slate"
              }`}
            >
              {loadingRecipients ? "조회 중..." : `${recipientCount.toLocaleString()}명`}
            </span>
          </div>
        </div>

        {/* Message */}
        <div className="rounded-[24px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-sm font-semibold text-ink">메시지 작성</h2>

          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-slate">
              메시지 유형
            </label>
            <div className="flex flex-wrap gap-2">
              {(["INFO", "WARNING", "REMINDER"] as MessageType[]).map((mt) => (
                <button
                  key={mt}
                  onClick={() => setMessageType(mt)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                    messageType === mt
                      ? mt === "WARNING"
                        ? "border-amber-400 bg-amber-400 text-white"
                        : mt === "REMINDER"
                          ? "border-sky-400 bg-sky-400 text-white"
                          : "border-forest bg-forest text-white"
                      : "border-ink/20 bg-white text-slate hover:border-ink/40"
                  }`}
                >
                  {MESSAGE_TYPE_LABELS[mt]}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-slate">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="알림 제목 입력..."
              maxLength={100}
              className="w-full rounded-2xl border border-ink/15 px-4 py-3 text-sm text-ink outline-none placeholder:text-slate/40 focus:border-forest focus:ring-1 focus:ring-forest/20 transition"
            />
            <p className="mt-1 text-right text-[10px] text-slate">{title.length}/100</p>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-slate">
              내용 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="알림 내용을 입력하세요..."
              rows={5}
              maxLength={1000}
              className="w-full resize-none rounded-2xl border border-ink/15 px-4 py-3 text-sm text-ink outline-none placeholder:text-slate/40 focus:border-forest focus:ring-1 focus:ring-forest/20 transition"
            />
            <p className="mt-1 text-right text-[10px] text-slate">{body.length}/1000</p>
          </div>
        </div>

        {/* Channel */}
        <div className="rounded-[24px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-sm font-semibold text-ink">발송 채널</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["ALIMTALK", "SMS", "WEB_PUSH"] as Channel[]).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={`rounded-2xl border p-4 text-left transition ${
                  channel === ch
                    ? "border-forest bg-forest/5"
                    : "border-ink/10 bg-white hover:border-forest/30"
                }`}
              >
                <p className={`text-sm font-semibold ${channel === ch ? "text-forest" : "text-ink"}`}>
                  {CHANNEL_LABELS[ch]}
                </p>
                <p className="mt-1 text-xs text-slate">
                  예상 도달: {CHANNEL_DELIVERY[ch]}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="rounded-[24px] border border-ink/10 bg-white p-6 shadow-panel">
          {!confirmed ? (
            <button
              onClick={() => {
                if (!canSubmit) return;
                setConfirmed(true);
              }}
              disabled={!canSubmit}
              className="w-full rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-40"
            >
              발송 준비 완료
            </button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                <strong>{recipientCount.toLocaleString()}명</strong>에게{" "}
                <strong>{CHANNEL_LABELS[channel]}</strong>으로 알림을 발송합니다. 계속하시겠습니까?
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmed(false)}
                  className="flex-1 rounded-full border border-ink/20 px-4 py-2.5 text-sm text-slate hover:bg-mist transition"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 rounded-full bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
                >
                  {submitting ? "발송 중..." : "발송하기"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Preview ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Message Preview */}
        <div className={`rounded-[24px] border p-6 ${MESSAGE_TYPE_PREVIEW_COLOR[messageType]}`}>
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-0.5 text-xs font-bold ${
                messageType === "WARNING"
                  ? "bg-amber-200 text-amber-800"
                  : messageType === "REMINDER"
                    ? "bg-sky-200 text-sky-800"
                    : "bg-forest/20 text-forest"
              }`}
            >
              {MESSAGE_TYPE_LABELS[messageType]}
            </span>
            <span className="text-xs text-slate">{CHANNEL_LABELS[channel]}</span>
          </div>
          <p className={`font-semibold text-sm ${MESSAGE_TYPE_TEXT_COLOR[messageType]}`}>
            학원 안내
          </p>
          <div className="mt-3 whitespace-pre-wrap text-sm text-ink leading-relaxed">
            {fullPreviewMsg}
          </div>
          <p className="mt-3 text-xs text-slate">
            예상 도달 시간: {CHANNEL_DELIVERY[channel]}
          </p>
        </div>

        {/* Recipient Preview */}
        <div className="rounded-[24px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">수신자 미리보기</h3>
            <span className="text-xs text-slate">
              {recipientType === "all-active"
                ? `전체 ${recipientCount.toLocaleString()}명 (샘플 미표시)`
                : `${recipientCount.toLocaleString()}명`}
            </span>
          </div>

          {recipientType === "all-active" ? (
            <p className="text-xs text-slate">
              전체 재학생 {recipientCount.toLocaleString()}명에게 발송됩니다.
            </p>
          ) : previewStudents.length === 0 ? (
            <p className="text-xs text-slate">수신자를 선택하면 미리보기가 표시됩니다.</p>
          ) : (
            <div className="space-y-2">
              {previewStudents.slice(0, 8).map((s) => (
                <div key={s.examNumber} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-ember">{s.examNumber}</span>
                  <span className="text-ink">{s.name}</span>
                  <span className="ml-auto text-slate">{s.phone ?? "—"}</span>
                </div>
              ))}
              {previewStudents.length > 8 && (
                <p className="text-xs text-slate pt-1 border-t border-ink/5">
                  외 {(previewStudents.length - 8).toLocaleString()}명 더...
                </p>
              )}
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-4 text-xs leading-relaxed text-slate">
          <p className="font-semibold text-forest mb-2">발송 안내</p>
          <ul className="list-disc list-inside space-y-1">
            <li>알림톡은 카카오 수신 동의 학생에게만 발송됩니다.</li>
            <li>SMS는 동의 여부와 무관하게 발송됩니다.</li>
            <li>웹 푸시는 앱 설치 및 알림 허용 학생에게만 발송됩니다.</li>
            <li>발송 이력은 &quot;발송 이력&quot; 메뉴에서 확인할 수 있습니다.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
