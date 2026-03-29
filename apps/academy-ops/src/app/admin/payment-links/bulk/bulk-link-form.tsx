"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CourseOption = {
  id: number;
  name: string;
  tuitionFee: number;
};

type CohortStudent = {
  examNumber: string;
  name: string;
};

type CohortOption = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string;
  endDate: string;
  students: CohortStudent[];
};

type PreviewStudent = {
  examNumber: string;
  name: string;
  source: "cohort" | "manual";
};

type CreatedLink = {
  id: number;
  token: string;
  title: string;
  examNumber: string | null;
  amount: number;
  finalAmount: number;
  expiresAt: string;
  status: string;
  studentName: string | null;
};

type BulkResult = {
  created: number;
  skipped: number;
  skippedNumbers: string[];
  links: CreatedLink[];
};

type Props = {
  courses: CourseOption[];
  cohorts: CohortOption[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPIRY_PRESETS = [
  { label: "24시간", hours: 24 },
  { label: "48시간", hours: 48 },
  { label: "72시간", hours: 72 },
  { label: "1주일", hours: 168 },
  { label: "직접 입력", hours: 0 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addHoursToNow(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

function defaultExpiresAt(): string {
  return addHoursToNow(168);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkLinkForm({ courses, cohorts }: Props) {
  const [isPending, startTransition] = useTransition();

  // Method: cohort or manual
  const [method, setMethod] = useState<"cohort" | "manual">("cohort");

  // Cohort method
  const [selectedCohortId, setSelectedCohortId] = useState("");

  // Manual method
  const [examNumbersText, setExamNumbersText] = useState("");
  const [resolvedStudents, setResolvedStudents] = useState<CohortStudent[]>([]);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState("");

  // Common settings
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [amount, setAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [allowPoint, setAllowPoint] = useState(true);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt());
  const [expiryPreset, setExpiryPreset] = useState("168");
  const [note, setNote] = useState("");

  // Result
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived preview list
  // ---------------------------------------------------------------------------

  const previewStudents: PreviewStudent[] = (() => {
    if (method === "cohort") {
      const cohort = cohorts.find((c) => c.id === selectedCohortId);
      return (cohort?.students ?? []).map((s) => ({ ...s, source: "cohort" as const }));
    }
    return resolvedStudents.map((s) => ({ ...s, source: "manual" as const }));
  })();

  // ---------------------------------------------------------------------------
  // Course selection — auto-fill amount
  // ---------------------------------------------------------------------------

  function handleCourseChange(id: string) {
    setCourseId(id);
    const course = courses.find((c) => String(c.id) === id);
    if (course) setAmount(String(course.tuitionFee));
  }

  // ---------------------------------------------------------------------------
  // Expiry preset
  // ---------------------------------------------------------------------------

  function handleExpiryPreset(preset: string) {
    setExpiryPreset(preset);
    const hours = Number(preset);
    if (hours > 0) setExpiresAt(addHoursToNow(hours));
  }

  // ---------------------------------------------------------------------------
  // Resolve manual exam numbers preview
  // ---------------------------------------------------------------------------

  async function handleResolvePreview() {
    const numbers = examNumbersText
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean);

    if (numbers.length === 0) {
      setResolvedStudents([]);
      return;
    }

    setResolveLoading(true);
    setResolveError("");

    try {
      // Use search API for each unique number — batch via query string
      const params = new URLSearchParams();
      numbers.forEach((n) => params.append("examNumbers", n));

      const data = await requestJson<{ students: CohortStudent[] }>(
        `/api/students/batch-lookup?${params.toString()}`,
      );
      setResolvedStudents(data.students);

      const found = new Set(data.students.map((s) => s.examNumber));
      const notFound = numbers.filter((n) => !found.has(n));
      if (notFound.length > 0) {
        setResolveError(`다음 학번을 찾을 수 없습니다: ${notFound.join(", ")}`);
      }
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "학번 조회에 실패했습니다.");
    } finally {
      setResolveLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    const examNumbers = previewStudents.map((s) => s.examNumber);

    if (examNumbers.length === 0) {
      setError("대상 학생이 없습니다. 기수를 선택하거나 학번을 입력해 주세요.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("링크 제목을 입력해 주세요.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("결제 금액을 입력해 주세요.");
      return;
    }

    if (!expiresAt) {
      setError("만료일시를 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      try {
        const data = await requestJson<BulkResult>("/api/payment-links/bulk", {
          method: "POST",
          body: JSON.stringify({
            examNumbers,
            title: trimmedTitle,
            courseId: courseId ? Number(courseId) : undefined,
            amount: parsedAmount,
            discountAmount: Number(discountAmount) || 0,
            allowPoint,
            expiresAt: new Date(expiresAt).toISOString(),
            note: note.trim() || undefined,
          }),
        });
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "생성에 실패했습니다.");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Copy link
  // ---------------------------------------------------------------------------

  function handleCopy(token: string) {
    copyToClipboard(`${getBaseUrl()}/pay/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const finalAmount = Math.max(0, (Number(amount) || 0) - (Number(discountAmount) || 0));

  const inputClass =
    "w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60 focus:ring-1 focus:ring-ember/30";

  const labelClass = "mb-1.5 block text-xs font-medium text-slate";

  // ---------------------------------------------------------------------------
  // If result is available, show result screen
  // ---------------------------------------------------------------------------

  if (result) {
    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <h2 className="text-lg font-semibold text-forest">생성 완료</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-forest/20 bg-white p-4 text-center">
              <p className="text-xs text-slate">생성된 링크</p>
              <p className="mt-1 text-2xl font-bold text-forest">{result.created}개</p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-white p-4 text-center">
              <p className="text-xs text-slate">건너뜀 (학번 없음)</p>
              <p className="mt-1 text-2xl font-bold text-slate">{result.skipped}개</p>
            </div>
          </div>
          {result.skipped > 0 && (
            <p className="mt-3 text-xs text-slate">
              건너뜀: {result.skippedNumbers.join(", ")}
            </p>
          )}
        </div>

        {/* Created links table */}
        <div className="rounded-[28px] border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold text-ink">생성된 결제 링크</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  {["학번", "이름", "금액", "만료일", "링크 복사"].map((h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {result.links.map((link) => (
                  <tr key={link.id} className="hover:bg-mist/30">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{link.examNumber}</td>
                    <td className="px-4 py-3 text-sm text-ink">{link.studentName ?? "-"}</td>
                    <td className="px-4 py-3 tabular-nums text-sm font-semibold text-ink">
                      {link.finalAmount.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {link.expiresAt.split("T")[0].replace(/-/g, ".")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleCopy(link.token)}
                        className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                      >
                        {copiedToken === link.token ? "복사됨" : "링크 복사"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setExamNumbersText("");
              setResolvedStudents([]);
              setSelectedCohortId("");
              setTitle("");
              setAmount("");
              setDiscountAmount("0");
              setNote("");
            }}
            className="rounded-full bg-ember px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            추가 생성
          </button>
          <Link
            href="/admin/payments/links"
            className="rounded-full border border-ink/15 px-8 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
          >
            결제 링크 목록
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main form
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── 대상 학생 선택 방법 ─────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">대상 학생 선택</h2>

        {/* Method tabs */}
        <div className="mb-4 flex rounded-2xl border border-ink/10 bg-mist/30 p-1">
          <button
            type="button"
            onClick={() => setMethod("cohort")}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${
              method === "cohort"
                ? "bg-white text-ink shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            기수 선택
          </button>
          <button
            type="button"
            onClick={() => setMethod("manual")}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${
              method === "manual"
                ? "bg-white text-ink shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            학번 직접 입력
          </button>
        </div>

        {/* Method 1: Cohort */}
        {method === "cohort" && (
          <div>
            <label className={labelClass}>기수 선택</label>
            <select
              value={selectedCohortId}
              onChange={(e) => setSelectedCohortId(e.target.value)}
              className={inputClass}
            >
              <option value="">기수를 선택하세요</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.students.length}명 ({new Date(c.startDate).toLocaleDateString("ko-KR")}~{new Date(c.endDate).toLocaleDateString("ko-KR")})
                </option>
              ))}
            </select>

            {selectedCohortId && cohorts.find((c) => c.id === selectedCohortId) && (
              <p className="mt-2 text-xs text-slate">
                {cohorts.find((c) => c.id === selectedCohortId)!.students.length}명의 수강생에게 링크가 생성됩니다.
              </p>
            )}
          </div>
        )}

        {/* Method 2: Manual exam numbers */}
        {method === "manual" && (
          <div>
            <label className={labelClass}>
              학번 입력 (쉼표 또는 줄바꿈으로 구분)
            </label>
            <textarea
              value={examNumbersText}
              onChange={(e) => {
                setExamNumbersText(e.target.value);
                setResolvedStudents([]);
                setResolveError("");
              }}
              rows={5}
              placeholder={"2024001\n2024002, 2024003\n2024004"}
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60 focus:ring-1 focus:ring-ember/30"
            />
            {resolveError && (
              <p className="mt-1.5 text-xs text-amber-700">{resolveError}</p>
            )}
            <button
              type="button"
              onClick={handleResolvePreview}
              disabled={resolveLoading || !examNumbersText.trim()}
              className="mt-2 rounded-full border border-ink/15 px-4 py-1.5 text-xs font-medium text-ink transition hover:border-ink/30 disabled:opacity-50"
            >
              {resolveLoading ? "조회 중…" : "학생 미리보기"}
            </button>
          </div>
        )}

        {/* Preview list */}
        {previewStudents.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate">
              대상 학생 {previewStudents.length}명
            </p>
            <div className="max-h-48 overflow-y-auto rounded-2xl border border-ink/10 bg-mist/30">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-slate">학번</th>
                    <th className="px-3 py-2 text-left text-slate">이름</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {previewStudents.map((s) => (
                    <tr key={s.examNumber} className="hover:bg-white/60">
                      <td className="px-3 py-1.5 font-mono text-ink">{s.examNumber}</td>
                      <td className="px-3 py-1.5 text-ink">{s.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── 링크 공통 설정 ────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">링크 공통 설정</h2>

        {/* Title */}
        <div className="mb-4">
          <label className={labelClass}>
            링크 제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2026 공채 종합반 3월 등록"
            required
            className={inputClass}
          />
        </div>

        {/* Course */}
        <div className="mb-4">
          <label className={labelClass}>강좌 연결 (선택)</label>
          <select
            value={courseId}
            onChange={(e) => handleCourseChange(e.target.value)}
            className={inputClass}
          >
            <option value="">강좌 선택 없음</option>
            {courses.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({c.tuitionFee.toLocaleString()}원)
              </option>
            ))}
          </select>
        </div>

        {/* Amount + Discount */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              결제 금액 (원) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              placeholder="600000"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>할인 금액 (원)</label>
            <input
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              min={0}
              placeholder="0"
              className={inputClass}
            />
          </div>
        </div>

        {amount && (
          <div className="mb-4 rounded-2xl border border-forest/15 bg-forest/5 px-4 py-2.5">
            <p className="text-sm font-semibold text-forest">
              최종 결제 금액: {finalAmount.toLocaleString()}원
            </p>
          </div>
        )}

        {/* Allow point */}
        <label className="mb-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allowPoint}
            onChange={(e) => setAllowPoint(e.target.checked)}
            className="h-4 w-4 rounded border-ink/20 text-ember"
          />
          <span className="text-sm text-ink">포인트 사용 허용</span>
        </label>
      </div>

      {/* ── 만료 설정 ─────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">만료 설정</h2>

        <div className="mb-3">
          <label className={labelClass}>
            만료 시간 <span className="text-red-500">*</span>
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            {EXPIRY_PRESETS.map((preset) => (
              <button
                key={preset.hours}
                type="button"
                onClick={() => handleExpiryPreset(String(preset.hours))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  expiryPreset === String(preset.hours)
                    ? "border-ember/40 bg-ember/10 text-ember"
                    : "border-ink/15 text-ink hover:border-ink/30"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => {
              setExpiresAt(e.target.value);
              setExpiryPreset("0");
            }}
            required
            className={inputClass}
          />
        </div>
      </div>

      {/* ── 메모 ─────────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">메모 (내부용, 선택)</h2>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 3월 특별 이벤트 일괄 발송"
          className={inputClass}
        />
      </div>

      {/* ── 생성 확인 배너 ─────────────────────────────────────────── */}
      {previewStudents.length > 0 && amount && (
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-sm font-semibold text-ember">
            {previewStudents.length}명에게 각각{" "}
            {finalAmount.toLocaleString()}원 결제 링크를 생성합니다.
          </p>
          <p className="mt-1 text-xs text-slate">
            생성 후 각 링크를 복사하여 카카오톡·문자로 전송하세요.
          </p>
        </div>
      )}

      {/* ── 버튼 ─────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending || previewStudents.length === 0}
          className="rounded-full bg-ember px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
        >
          {isPending
            ? "생성 중…"
            : previewStudents.length > 0
              ? `${previewStudents.length}명 링크 일괄 생성`
              : "링크 일괄 생성"}
        </button>
        <Link
          href="/admin/payments/links"
          className="rounded-full border border-ink/15 px-8 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          취소
        </Link>
      </div>
    </form>
  );
}
