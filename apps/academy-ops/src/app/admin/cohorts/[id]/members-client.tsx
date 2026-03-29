"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnrollmentWithStudent = {
  id: string;
  examNumber: string;
  studentName: string | null;
  studentPhone: string | null;
  createdAt: string;
  finalFee: number;
  discountAmount: number;
  status:
    | "PENDING"
    | "ACTIVE"
    | "WAITING"
    | "SUSPENDED"
    | "COMPLETED"
    | "WITHDRAWN"
    | "CANCELLED";
  waitlistOrder: number | null;
};

type Props = {
  enrollments: EnrollmentWithStudent[];
  cohortId: string;
  enrollmentStatusLabel: Record<string, string>;
  enrollmentStatusColor: Record<string, string>;
};

type FilterStatus = "ALL" | "ACTIVE" | "PENDING" | "WAITING" | "SUSPENDED" | "COMPLETED";

const FILTER_TABS: { value: FilterStatus; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "ACTIVE", label: "수강 중" },
  { value: "PENDING", label: "신청" },
  { value: "WAITING", label: "대기" },
  { value: "SUSPENDED", label: "휴원" },
  { value: "COMPLETED", label: "수료" },
];

// ---------------------------------------------------------------------------
// Broadcast modal
// ---------------------------------------------------------------------------

type NotificationTemplate = {
  id: string;
  type: string;
  channel: string;
  titleKo: string | null;
};

type BroadcastResult = {
  sent: number;
  failed: number;
  skipped: number;
};

type BroadcastModalProps = {
  cohortId: string;
  activeCount: number;
  onClose: () => void;
};

function BroadcastModal({ cohortId, activeCount, onClose }: BroadcastModalProps) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState("");

  // Fetch templates on mount
  useEffect(() => {
    fetch("/api/notification-templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { templates?: NotificationTemplate[] }) => {
        setTemplates(data.templates ?? []);
        if (data.templates?.length) setSelectedTemplateId(data.templates[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, []);

  function handleSend() {
    if (!selectedTemplateId) {
      setError("알림 템플릿을 선택해 주세요.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/notifications/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: selectedTemplateId,
            recipientGroup: "cohort",
            cohortId,
          }),
        });
        const data = (await res.json()) as BroadcastResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0, skipped: data.skipped ?? 0 });
      } catch (err) {
        setError(err instanceof Error ? err.message : "발송에 실패했습니다.");
      }
    });
  }

  const CloseIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-[28px] border border-ink/10 bg-white p-6 shadow-lg">
        {result ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forest/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1F4D3A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-ink">알림 발송 완료</h3>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-forest/20 bg-forest/5 p-3 text-center">
                <p className="text-xs text-slate">발송</p>
                <p className="text-lg font-bold text-forest">{result.sent}</p>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-center">
                <p className="text-xs text-slate">실패</p>
                <p className="text-lg font-bold text-red-600">{result.failed}</p>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-mist/50 p-3 text-center">
                <p className="text-xs text-slate">건너뜀</p>
                <p className="text-lg font-bold text-slate">{result.skipped}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-full bg-forest px-6 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">기수 단체 알림</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-slate transition hover:bg-mist hover:text-ink"
                aria-label="닫기"
              >
                <CloseIcon />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate">
              수강 중인 학생 {activeCount}명에게 알림톡을 발송합니다.
              (수신 동의 + 연락처 보유 학생만 실제 발송됩니다)
            </p>

            {error && (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate">
                알림 템플릿 선택
              </label>
              {loadingTemplates ? (
                <p className="text-xs text-slate">템플릿 로딩 중…</p>
              ) : templates.length === 0 ? (
                <p className="text-xs text-amber-700">등록된 알림 템플릿이 없습니다.</p>
              ) : (
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60 focus:ring-1 focus:ring-ember/30"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.titleKo ?? t.type} ({t.channel})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleSend}
                disabled={isPending || !selectedTemplateId || loadingTemplates}
                className="flex-1 rounded-full bg-ember py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
              >
                {isPending ? "발송 중…" : `${activeCount}명에게 발송`}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
              >
                취소
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MembersClient({
  enrollments,
  cohortId,
  enrollmentStatusLabel,
  enrollmentStatusColor,
}: Props) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState("");
  const [showBroadcast, setShowBroadcast] = useState(false);

  const activeCount = enrollments.filter((e) => e.status === "ACTIVE").length;

  const filtered = enrollments.filter((e) => {
    const matchStatus =
      filterStatus === "ALL" || e.status === filterStatus;
    const matchSearch =
      !search ||
      (e.studentName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      e.examNumber.includes(search);
    return matchStatus && matchSearch;
  });

  function countByStatus(status: FilterStatus) {
    if (status === "ALL") return enrollments.length;
    return enrollments.filter((e) => e.status === status).length;
  }

  return (
    <>
      {showBroadcast && (
        <BroadcastModal
          cohortId={cohortId}
          activeCount={activeCount}
          onClose={() => setShowBroadcast(false)}
        />
      )}

      <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-ink/10 px-5 py-4">
          {/* Status tabs */}
          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-mist/40 p-1">
            {FILTER_TABS.map((tab) => {
              const count = countByStatus(tab.value);
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setFilterStatus(tab.value)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    filterStatus === tab.value
                      ? "bg-forest text-white shadow-sm"
                      : "text-slate hover:text-ink"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`tabular-nums ${
                        filterStatus === tab.value
                          ? "text-white/80"
                          : "text-slate/70"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="이름 또는 학번 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-full border border-ink/10 bg-white px-4 text-sm text-ink placeholder:text-slate/60 focus:border-forest/40 focus:outline-none"
          />

          <span className="ml-auto text-xs text-slate">
            {filtered.length}명
          </span>

          {/* Broadcast button */}
          <button
            type="button"
            onClick={() => setShowBroadcast(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember/90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.85 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.78 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.99 5.99l.93-.93a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            기수 단체 알림
          </button>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate">
            {search
              ? `"${search}"에 해당하는 학생이 없습니다.`
              : "해당 상태의 수강생이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    학번
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    이름
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    연락처
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    등록일
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate">
                    수강료
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate">
                    상태
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate">
                    조치
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filtered.map((enrollment) => (
                  <tr key={enrollment.id} className="hover:bg-mist/20">
                    {/* 학번 */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${enrollment.examNumber}`}
                        className="font-mono text-xs font-medium text-forest transition hover:underline"
                      >
                        {enrollment.examNumber}
                      </Link>
                    </td>

                    {/* 이름 */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${enrollment.examNumber}`}
                        className="font-medium text-ink transition hover:text-ember hover:underline"
                      >
                        {enrollment.studentName ?? "-"}
                      </Link>
                    </td>

                    {/* 연락처 */}
                    <td className="px-4 py-3 font-mono text-xs text-slate">
                      {enrollment.studentPhone ?? "-"}
                    </td>

                    {/* 등록일 */}
                    <td className="px-4 py-3 text-xs text-slate">
                      {enrollment.createdAt.slice(0, 10).replace(/-/g, ".")}
                    </td>

                    {/* 수강료 */}
                    <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-ink">
                      {enrollment.finalFee.toLocaleString()}원
                      {enrollment.discountAmount > 0 && (
                        <span className="ml-1 text-xs font-normal text-slate">
                          (-{enrollment.discountAmount.toLocaleString()})
                        </span>
                      )}
                    </td>

                    {/* 상태 */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          enrollmentStatusColor[enrollment.status] ??
                          "border-ink/10 bg-mist text-slate"
                        }`}
                      >
                        {enrollmentStatusLabel[enrollment.status] ?? enrollment.status}
                      </span>
                      {enrollment.status === "WAITING" &&
                        enrollment.waitlistOrder != null && (
                          <span className="ml-1 text-xs text-slate">
                            #{enrollment.waitlistOrder}
                          </span>
                        )}
                    </td>

                    {/* 조치 */}
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/admin/enrollments/${enrollment.id}`}
                        className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30 hover:bg-mist"
                      >
                        수강 상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
