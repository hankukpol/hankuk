"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

// ─── types ────────────────────────────────────────────────────────────────────

type CounselingType = "신규방문" | "전화" | "재방문" | "온라인";
type PurchaseIntent = "높음" | "보통" | "낮음";

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

interface StudentSearchResult {
  examNumber: string;
  name: string;
  phone: string | null;
}

interface FormState {
  visitedAt: string;
  examNumber: string;
  studentName: string;
  counselingType: CounselingType;
  counselorName: string;
  content: string;
  courseInterest: string;
  nextSchedule: string;
  purchaseIntent: PurchaseIntent;
  recommendation: string;
}

function buildDefaultForm(defaultCounselor: string): FormState {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const localDatetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return {
    visitedAt: localDatetime,
    examNumber: "",
    studentName: "",
    counselingType: "신규방문",
    counselorName: defaultCounselor,
    content: "",
    courseInterest: "",
    nextSchedule: "",
    purchaseIntent: "보통",
    recommendation: "",
  };
}

// ─── component ────────────────────────────────────────────────────────────────

interface ConsultationFormProps {
  defaultCounselorName: string;
  staffList: StaffOption[];
}

export function ConsultationForm({
  defaultCounselorName,
  staffList,
}: ConsultationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() =>
    buildDefaultForm(defaultCounselorName),
  );

  // Student search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] =
    useState<StudentSearchResult | null>(null);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ─── Student search ──────────────────────────────────────────────────────────

  async function handleStudentSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/students/search?q=${encodeURIComponent(q)}&limit=8`,
      );
      if (res.ok) {
        const json = (await res.json()) as {
          students?: StudentSearchResult[];
          data?: StudentSearchResult[];
        };
        const list = json.students ?? json.data ?? [];
        setSearchResults(list);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function selectStudent(s: StudentSearchResult) {
    setSelectedStudent(s);
    patch("examNumber", s.examNumber);
    patch("studentName", s.name);
    setSearchResults([]);
    setSearchQuery(s.name);
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  function handleSubmit() {
    if (!form.examNumber) {
      toast.error("학생을 검색하여 선택해 주세요.");
      return;
    }
    if (!form.counselorName.trim()) {
      toast.error("담당 직원을 선택해 주세요.");
      return;
    }
    if (!form.content.trim()) {
      toast.error("상담 내용을 입력해 주세요.");
      return;
    }
    if (!form.visitedAt) {
      toast.error("방문 일시를 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      try {
        // Build content with meta-prefix for type inference
        const typePrefix =
          form.counselingType !== "신규방문"
            ? `[${form.counselingType}] `
            : "";
        const intentSuffix =
          form.purchaseIntent !== "보통"
            ? `\n수강의향: ${form.purchaseIntent}`
            : "";
        const interestSuffix = form.courseInterest
          ? `\n관심강좌: ${form.courseInterest}`
          : "";

        const enrichedContent =
          typePrefix + form.content + intentSuffix + interestSuffix;

        const body = {
          examNumber: form.examNumber,
          counselorName: form.counselorName,
          content: enrichedContent,
          recommendation: form.recommendation || null,
          counseledAt: new Date(form.visitedAt).toISOString(),
          nextSchedule: form.nextSchedule
            ? new Date(form.nextSchedule).toISOString()
            : null,
        };

        const res = await fetch("/api/counseling", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "저장 실패");
        }

        const result = (await res.json()) as { record?: { id?: number } };
        const recordId = result.record?.id;

        toast.success("상담 기록이 등록되었습니다.");
        if (recordId) {
          router.push(`/admin/counseling/${recordId}`);
        } else {
          router.push("/admin/consultations");
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "상담 등록 중 오류가 발생했습니다.",
        );
      }
    });
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  const COUNSELING_TYPES: CounselingType[] = [
    "신규방문",
    "전화",
    "재방문",
    "온라인",
  ];
  const PURCHASE_INTENTS: PurchaseIntent[] = ["높음", "보통", "낮음"];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 방문 일시 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">방문 일시</h2>
        <input
          type="datetime-local"
          value={form.visitedAt}
          onChange={(e) => patch("visitedAt", e.target.value)}
          className="w-full rounded-xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:border-forest/40 focus:outline-none"
        />
      </div>

      {/* 학생 검색 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">학생 검색</h2>

        {selectedStudent ? (
          <div className="flex items-center justify-between rounded-xl border border-forest/30 bg-forest/5 px-4 py-3">
            <div>
              <p className="font-semibold text-ink">{selectedStudent.name}</p>
              <p className="text-xs text-slate">
                {selectedStudent.examNumber} ·{" "}
                {selectedStudent.phone ?? "연락처 없음"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedStudent(null);
                patch("examNumber", "");
                patch("studentName", "");
                setSearchQuery("");
              }}
              className="text-xs text-slate hover:text-ember"
            >
              변경
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleStudentSearch();
                  }
                }}
                placeholder="이름 또는 학번으로 검색"
                className="flex-1 rounded-xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:border-forest/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleStudentSearch()}
                disabled={isSearching}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
              >
                {isSearching ? "검색 중..." : "검색"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="rounded-xl border border-ink/10 bg-mist divide-y divide-ink/5">
                {searchResults.map((s) => (
                  <button
                    key={s.examNumber}
                    type="button"
                    onClick={() => selectStudent(s)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-forest/5"
                  >
                    <span className="font-semibold text-ink">{s.name}</span>
                    <span className="text-xs text-slate">{s.examNumber}</span>
                    {s.phone && (
                      <span className="ml-auto text-xs text-slate">{s.phone}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !isSearching && (
              <p className="text-xs text-slate">
                검색 결과가 없습니다. 다시 검색해 주세요.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 상담 유형 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">상담 유형</h2>
        <div className="flex flex-wrap gap-3">
          {COUNSELING_TYPES.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="counselingType"
                value={t}
                checked={form.counselingType === t}
                onChange={() => patch("counselingType", t)}
                className="accent-ember"
              />
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  form.counselingType === t
                    ? "bg-ember text-white"
                    : "border border-ink/10 bg-mist text-slate hover:border-ember/30 hover:text-ember"
                }`}
              >
                {t}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 담당 직원 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">담당 직원</h2>
        <select
          value={form.counselorName}
          onChange={(e) => patch("counselorName", e.target.value)}
          className="w-full rounded-xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:border-forest/40 focus:outline-none"
        >
          <option value="">직원 선택</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
          {/* fallback: allow manual entry via text input below */}
        </select>
        {!staffList.find((s) => s.name === form.counselorName) &&
          form.counselorName && (
            <p className="mt-2 text-xs text-slate">
              직접 입력된 이름: {form.counselorName}
            </p>
          )}
        <input
          type="text"
          value={form.counselorName}
          onChange={(e) => patch("counselorName", e.target.value)}
          placeholder="또는 직접 이름 입력"
          className="mt-2 w-full rounded-xl border border-ink/10 bg-mist px-4 py-2 text-sm focus:border-forest/40 focus:outline-none"
        />
      </div>

      {/* 상담 내용 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">상담 내용</h2>
        <textarea
          value={form.content}
          onChange={(e) => patch("content", e.target.value)}
          rows={5}
          placeholder="상담 내용을 상세히 기록해 주세요."
          className="w-full rounded-xl border border-ink/10 bg-mist px-4 py-3 text-sm leading-relaxed focus:border-forest/40 focus:outline-none"
        />
      </div>

      {/* 관심 강좌 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">관심 강좌</h2>
        <input
          type="text"
          value={form.courseInterest}
          onChange={(e) => patch("courseInterest", e.target.value)}
          placeholder="예: 경찰공채 종합반, 형사법 단과 등"
          className="w-full rounded-xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:border-forest/40 focus:outline-none"
        />
      </div>

      {/* 수강 의향 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">수강 의향</h2>
        <div className="flex flex-wrap gap-3">
          {PURCHASE_INTENTS.map((intent) => (
            <label key={intent} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="purchaseIntent"
                value={intent}
                checked={form.purchaseIntent === intent}
                onChange={() => patch("purchaseIntent", intent)}
                className="accent-ember"
              />
              <span
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  form.purchaseIntent === intent
                    ? intent === "높음"
                      ? "bg-forest text-white"
                      : intent === "낮음"
                      ? "bg-red-500 text-white"
                      : "bg-amber-500 text-white"
                    : "border border-ink/10 bg-mist text-slate hover:border-forest/30"
                }`}
              >
                {intent}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 다음 예정 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">
          다음 예정 (선택)
        </h2>
        <input
          type="datetime-local"
          value={form.nextSchedule}
          onChange={(e) => patch("nextSchedule", e.target.value)}
          className="w-full rounded-xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:border-forest/40 focus:outline-none"
        />
        <p className="mt-2 text-xs text-slate">
          다음 상담 예약 일시를 설정하면 면담 기록에 표시됩니다.
        </p>
      </div>

      {/* 권고사항 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-ink">
          권고사항 (선택)
        </h2>
        <textarea
          value={form.recommendation}
          onChange={(e) => patch("recommendation", e.target.value)}
          rows={3}
          placeholder="학생에게 권고할 내용이 있으면 입력해 주세요."
          className="w-full rounded-xl border border-ink/10 bg-mist px-4 py-3 text-sm leading-relaxed focus:border-forest/40 focus:outline-none"
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pb-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-ink/10 px-6 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-full bg-ember px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60"
        >
          {isPending ? "등록 중..." : "상담 등록"}
        </button>
      </div>
    </div>
  );
}
