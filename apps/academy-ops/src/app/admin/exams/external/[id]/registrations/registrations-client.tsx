"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ExamDivision } from "@prisma/client";

const DIVISION_LABEL: Record<ExamDivision, string> = {
  GONGCHAE_M: "공채 남",
  GONGCHAE_F: "공채 여",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

export type RegistrationRow = {
  id: string;
  examNumber: string | null;
  externalName: string | null;
  externalPhone: string | null;
  division: ExamDivision;
  isPaid: boolean;
  paidAmount: number;
  paidAt: string | null;
  seatNumber: string | null;
  registeredAt: string;
  student: {
    examNumber: string;
    name: string;
    phone: string | null;
  } | null;
  hasScore: boolean;
};

export type ExamEventInfo = {
  id: string;
  title: string;
  examDate: string;
  venue: string | null;
  registrationFee: number;
};

type FilterTab = "all" | "internal" | "external" | "unscored";

interface Props {
  event: ExamEventInfo;
  initialRegistrations: RegistrationRow[];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function RegistrationsClient({ event, initialRegistrations }: Props) {
  const [registrations, setRegistrations] = useState<RegistrationRow[]>(initialRegistrations);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Add form state
  const [formType, setFormType] = useState<"internal" | "external">("internal");
  const [formExamNumber, setFormExamNumber] = useState("");
  const [formExternalName, setFormExternalName] = useState("");
  const [formExternalPhone, setFormExternalPhone] = useState("");
  const [formDivision, setFormDivision] = useState<ExamDivision>("GONGCHAE_M");
  const [formIsPaid, setFormIsPaid] = useState(false);

  // Stats
  const stats = useMemo(() => {
    const total = registrations.length;
    const scored = registrations.filter((r) => r.hasScore).length;
    const paid = registrations.filter((r) => r.isPaid).length;
    return { total, scored, unscored: total - scored, paid, unpaid: total - paid };
  }, [registrations]);

  // Filtered rows
  const filtered = useMemo(() => {
    switch (filter) {
      case "internal":
        return registrations.filter((r) => r.examNumber !== null);
      case "external":
        return registrations.filter((r) => r.examNumber === null);
      case "unscored":
        return registrations.filter((r) => !r.hasScore);
      default:
        return registrations;
    }
  }, [registrations, filter]);

  // Excel export
  const handleExport = () => {
    const headers = ["학번", "이름", "연락처", "구분", "납부여부", "납부금액", "성적여부", "등록일"];
    const rows = filtered.map((r) => {
      const name = r.student?.name ?? r.externalName ?? "-";
      const phone = r.student?.phone ?? r.externalPhone ?? "-";
      const isInternal = r.examNumber !== null;
      return [
        r.examNumber ?? "외부",
        name,
        phone,
        DIVISION_LABEL[r.division],
        r.isPaid ? "납부" : "미납",
        r.paidAmount.toLocaleString(),
        r.hasScore ? "입력완료" : "미입력",
        formatDateTime(r.registeredAt),
      ].join("\t");
    });
    const content = [headers.join("\t"), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title}_등록자.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);

    try {
      const body =
        formType === "internal"
          ? { examNumber: formExamNumber.trim(), division: formDivision, isPaid: formIsPaid }
          : {
              externalName: formExternalName.trim(),
              externalPhone: formExternalPhone.trim() || undefined,
              division: formDivision,
              isPaid: formIsPaid,
            };

      const res = await fetch(`/api/exams/external/${event.id}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddError(json.error ?? "등록 실패");
        return;
      }
      setRegistrations((prev) => [...prev, json.data as RegistrationRow]);
      setShowAddForm(false);
      setFormExamNumber("");
      setFormExternalName("");
      setFormExternalPhone("");
      setFormDivision("GONGCHAE_M");
      setFormIsPaid(false);
    } catch {
      setAddError("네트워크 오류가 발생했습니다.");
    } finally {
      setAddLoading(false);
    }
  };

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "전체", count: stats.total },
    { key: "internal", label: "재원생", count: registrations.filter((r) => r.examNumber !== null).length },
    { key: "external", label: "외부", count: registrations.filter((r) => r.examNumber === null).length },
    { key: "unscored", label: "성적미입력", count: stats.unscored },
  ];

  return (
    <div>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">총 등록</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {stats.total}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">전체 응시 등록 수</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest">성적 입력 완료</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {stats.scored}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            미입력 {stats.unscored}명
          </p>
        </div>
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ember">납부 완료</p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {stats.paid}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            {event.registrationFee > 0
              ? `참가비 ${event.registrationFee.toLocaleString()}원`
              : "참가비 무료"}
          </p>
        </div>
        <div className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">납부 미완</p>
          <p className="mt-3 text-3xl font-bold text-amber-700">
            {stats.unpaid}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">납부 대기 중</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                filter === tab.key
                  ? "border-[#C55A11] bg-[#C55A11] text-white"
                  : "border-ink/10 bg-white text-ink hover:border-[#C55A11]/30 hover:text-[#C55A11]"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  filter === tab.key ? "bg-white/20 text-white" : "bg-ink/5 text-slate"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            엑셀 내보내기
          </button>
          <button
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-full bg-[#C55A11] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 등록 추가
          </button>
        </div>
      </div>

      {/* Inline Add Form */}
      {showAddForm && (
        <div className="mt-4 rounded-[24px] border border-ink/10 bg-white p-5">
          <h3 className="text-base font-semibold">새 등록 추가</h3>
          <form onSubmit={handleAddSubmit} className="mt-4 space-y-4">
            {/* Type toggle */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFormType("internal")}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  formType === "internal"
                    ? "border-[#1F4D3A] bg-[#1F4D3A] text-white"
                    : "border-ink/10 bg-white text-ink"
                }`}
              >
                재원생
              </button>
              <button
                type="button"
                onClick={() => setFormType("external")}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  formType === "external"
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-ink/10 bg-white text-ink"
                }`}
              >
                외부 수험생
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {formType === "internal" ? (
                <div>
                  <label className="mb-1 block text-sm font-medium">학번</label>
                  <input
                    type="text"
                    value={formExamNumber}
                    onChange={(e) => setFormExamNumber(e.target.value)}
                    placeholder="예: 2024-001"
                    required
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-[#C55A11] focus:outline-none"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">이름</label>
                    <input
                      type="text"
                      value={formExternalName}
                      onChange={(e) => setFormExternalName(e.target.value)}
                      placeholder="외부 수험생 이름"
                      required
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-[#C55A11] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">연락처</label>
                    <input
                      type="text"
                      value={formExternalPhone}
                      onChange={(e) => setFormExternalPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-[#C55A11] focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">구분</label>
                <select
                  value={formDivision}
                  onChange={(e) => setFormDivision(e.target.value as ExamDivision)}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-[#C55A11] focus:outline-none"
                >
                  {Object.entries(DIVISION_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="isPaid"
                  checked={formIsPaid}
                  onChange={(e) => setFormIsPaid(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <label htmlFor="isPaid" className="text-sm font-medium">
                  참가비 납부 완료
                  {event.registrationFee > 0
                    ? ` (${event.registrationFee.toLocaleString()}원)`
                    : ""}
                </label>
              </div>
            </div>

            {addError && (
              <p className="rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-600">{addError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={addLoading}
                className="inline-flex items-center gap-2 rounded-full bg-[#C55A11] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:opacity-50"
              >
                {addLoading ? "처리 중..." : "등록"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setAddError("");
                }}
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-[24px] border border-ink/10 bg-white">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            {filter === "all" ? "등록된 응시자가 없습니다." : "해당 조건의 응시자가 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-[#F7F4EF]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">학번</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">구분</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">유형</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">납부</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">성적</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">등록일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {filtered.map((reg) => {
                  const isInternal = reg.examNumber !== null;
                  const name = reg.student?.name ?? reg.externalName ?? "-";
                  const phone = reg.student?.phone ?? reg.externalPhone ?? "-";
                  const displayExamNumber = reg.examNumber ?? "-";

                  return (
                    <tr key={reg.id} className="hover:bg-[#F7F4EF]/50 transition">
                      <td className="px-4 py-3 font-mono text-sm">
                        {isInternal ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="font-semibold text-[#C55A11] hover:underline"
                          >
                            {displayExamNumber}
                          </Link>
                        ) : (
                          <span className="text-slate">외부</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">
                        {isInternal ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate">{phone}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-ink/10 bg-[#F7F4EF] px-2.5 py-0.5 text-xs font-medium">
                          {DIVISION_LABEL[reg.division]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            isInternal
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-purple-200 bg-purple-50 text-purple-700"
                          }`}
                        >
                          {isInternal ? "재원생" : "외부"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            reg.isPaid
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {reg.isPaid ? "납부" : "미납"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            reg.hasScore
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-red-200 bg-red-50 text-red-600"
                          }`}
                        >
                          {reg.hasScore ? "입력완료" : "미입력"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {formatDateTime(reg.registeredAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-slate">
        총 {filtered.length}명 표시
        {filter !== "all" ? ` (전체 ${registrations.length}명 중)` : ""}
      </p>
    </div>
  );
}
