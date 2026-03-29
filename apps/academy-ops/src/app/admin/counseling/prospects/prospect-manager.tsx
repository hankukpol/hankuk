"use client";

import Link from "next/link";
import { ExamType, ProspectSource, ProspectStage } from "@prisma/client";
import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";

type ProspectRecord = {
  id: string;
  name: string;
  phone: string | null;
  examType: ExamType | null;
  source: ProspectSource;
  stage: ProspectStage;
  note: string | null;
  staffId: string;
  enrollmentId: string | null;
  visitedAt: string;
  createdAt: string;
  updatedAt: string;
  staff: { name: string } | null;
};

type ProspectManagerProps = {
  initialProspects: ProspectRecord[];
};

const SOURCE_LABELS: Record<ProspectSource, string> = {
  WALK_IN: "내방",
  PHONE: "전화",
  SNS: "SNS",
  REFERRAL: "추천",
  OTHER: "기타",
};

const STAGE_LABELS: Record<ProspectStage, string> = {
  INQUIRY: "문의",
  VISITING: "내방상담",
  DECIDING: "검토중",
  REGISTERED: "등록완료",
  DROPPED: "이탈",
};

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const STAGE_BADGE_CLASS: Record<ProspectStage, string> = {
  INQUIRY: "bg-slate-100 text-slate-600",
  VISITING: "bg-blue-50 text-blue-700",
  DECIDING: "bg-amber-50 text-amber-700",
  REGISTERED: "bg-[#1F4D3A]/10 text-[#1F4D3A]",
  DROPPED: "bg-red-50 text-red-700",
};

type FormState = {
  name: string;
  phone: string;
  examType: ExamType | "";
  source: ProspectSource;
  stage: ProspectStage;
  note: string;
  visitedAt: string;
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DEFAULT_FORM: FormState = {
  name: "",
  phone: "",
  examType: "",
  source: ProspectSource.WALK_IN,
  stage: ProspectStage.INQUIRY,
  note: "",
  visitedAt: todayIso(),
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청 실패");
  return data as T;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function ProspectManager({ initialProspects }: ProspectManagerProps) {
  const [prospects, setProspects] = useState<ProspectRecord[]>(initialProspects);
  const [filterStage, setFilterStage] = useState<ProspectStage | "ALL">("ALL");
  const [filterSource, setFilterSource] = useState<ProspectSource | "ALL">("ALL");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  // Stage counts
  const stageCounts = (Object.keys(STAGE_LABELS) as ProspectStage[]).reduce(
    (acc, s) => {
      acc[s] = prospects.filter((p) => p.stage === s).length;
      return acc;
    },
    {} as Record<ProspectStage, number>,
  );

  // Conversion stats (this month)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthProspects = prospects.filter((p) => new Date(p.createdAt) >= monthStart);
  const thisMonthRegistered = thisMonthProspects.filter((p) => p.stage === ProspectStage.REGISTERED).length;
  const conversionRate =
    thisMonthProspects.length > 0
      ? Math.round((thisMonthRegistered / thisMonthProspects.length) * 100)
      : 0;

  const filteredProspects = prospects.filter((p) => {
    if (filterStage !== "ALL" && p.stage !== filterStage) return false;
    if (filterSource !== "ALL" && p.source !== filterSource) return false;
    return true;
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...DEFAULT_FORM, visitedAt: todayIso() });
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function openEdit(record: ProspectRecord) {
    setEditingId(record.id);
    setForm({
      name: record.name,
      phone: record.phone ?? "",
      examType: record.examType ?? "",
      source: record.source,
      stage: record.stage,
      note: record.note ?? "",
      visitedAt: record.visitedAt.slice(0, 10),
    });
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm({ ...DEFAULT_FORM, visitedAt: todayIso() });
    setErrorMessage(null);
  }

  function handleSave() {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const body = {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          examType: form.examType || null,
          source: form.source,
          stage: form.stage,
          note: form.note.trim() || null,
          visitedAt: form.visitedAt,
        };

        if (editingId !== null) {
          const result = await requestJson<{ prospect: ProspectRecord }>(
            `/api/counseling/prospects/${editingId}`,
            { method: "PATCH", body: JSON.stringify(body) },
          );
          setProspects((prev) =>
            prev.map((p) => (p.id === editingId ? result.prospect : p)),
          );
          setSuccessMessage("상담 방문자 정보를 수정했습니다.");
        } else {
          const result = await requestJson<{ prospect: ProspectRecord }>(
            "/api/counseling/prospects",
            { method: "POST", body: JSON.stringify(body) },
          );
          setProspects((prev) => [result.prospect, ...prev]);
          setSuccessMessage("상담 방문자를 등록했습니다.");
        }

        closeForm();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  function handleDelete(record: ProspectRecord) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: `상담 방문자 삭제: ${record.name}`,
      description: "이 상담 방문자 기록을 삭제하시겠습니까? 삭제한 기록은 복구할 수 없습니다.",
      details: [
        `이름: ${record.name}`,
        `단계: ${STAGE_LABELS[record.stage]}`,
        `유입경로: ${SOURCE_LABELS[record.source]}`,
        `방문일: ${formatDate(record.visitedAt)}`,
      ],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setSuccessMessage(null);
        setErrorMessage(null);

        startTransition(async () => {
          try {
            await requestJson<{ ok: true }>(
              `/api/counseling/prospects/${record.id}`,
              { method: "DELETE" },
            );
            setProspects((prev) => prev.filter((p) => p.id !== record.id));
            setSuccessMessage("상담 방문자 기록을 삭제했습니다.");
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  const stageFilters: Array<{ value: ProspectStage | "ALL"; label: string }> = [
    { value: "ALL", label: "전체" },
    ...(Object.keys(STAGE_LABELS) as ProspectStage[]).map((s) => ({
      value: s,
      label: STAGE_LABELS[s],
    })),
  ];

  const sourceFilters: Array<{ value: ProspectSource | "ALL"; label: string }> = [
    { value: "ALL", label: "전체" },
    ...(Object.keys(SOURCE_LABELS) as ProspectSource[]).map((s) => ({
      value: s,
      label: SOURCE_LABELS[s],
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Conversion stats card */}
      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">이번 달 방문자</p>
          <p className="mt-3 text-3xl font-semibold">
            {thisMonthProspects.length}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">이번 달 신규 상담 방문자</p>
        </article>
        <article className="rounded-[28px] border border-[#1F4D3A]/20 bg-[#1F4D3A]/10 p-6">
          <p className="text-sm text-slate">이번 달 등록완료</p>
          <p className="mt-3 text-3xl font-semibold text-[#1F4D3A]">
            {thisMonthRegistered}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">REGISTERED 단계 전환</p>
        </article>
        <article className="rounded-[28px] border border-[#C55A11]/20 bg-[#C55A11]/10 p-6">
          <p className="text-sm text-slate">이번 달 전환율</p>
          <p className="mt-3 text-3xl font-semibold text-[#C55A11]">
            {conversionRate}
            <span className="ml-1 text-base font-normal text-slate">%</span>
          </p>
          <p className="mt-2 text-xs text-slate">등록완료 / 이번 달 방문자</p>
        </article>
      </div>

      {/* Stage summary badges */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STAGE_LABELS) as ProspectStage[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStage(filterStage === s ? "ALL" : s)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filterStage === s
                ? STAGE_BADGE_CLASS[s] + " border-current"
                : "border-ink/10 bg-white text-slate hover:border-ink/20"
            }`}
          >
            <span>{STAGE_LABELS[s]}</span>
            <span
              className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs ${
                filterStage === s ? "bg-current/10" : "bg-slate-100 text-slate-600"
              }`}
            >
              {stageCounts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            {sourceFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterSource(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterSource === f.value
                    ? "bg-ink text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-[#C55A11] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#C55A11]/90"
        >
          <span>+</span>
          <span>신규 등록</span>
        </button>
      </div>

      {/* Messages */}
      {successMessage ? (
        <div className="rounded-2xl border border-[#1F4D3A]/20 bg-[#1F4D3A]/10 px-4 py-3 text-sm text-[#1F4D3A]">
          {successMessage}
        </div>
      ) : null}
      {errorMessage && !isFormOpen ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {["이름", "연락처", "시험유형", "유입경로", "단계", "메모", "방문일", "담당자", "수정"].map(
                  (header) => (
                    <th
                      key={header}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {filteredProspects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate">
                    조건에 맞는 상담 방문자가 없습니다.
                  </td>
                </tr>
              ) : null}
              {filteredProspects.map((record) => (
                <tr key={record.id} className="transition hover:bg-mist/30">
                  <td className="px-4 py-3 font-semibold text-ink">
                    <Link
                      href={`/admin/prospects/${record.id}`}
                      className="transition hover:text-ember hover:underline"
                    >
                      {record.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate">
                    {record.phone ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {record.examType ? EXAM_TYPE_LABELS[record.examType] : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {SOURCE_LABELS[record.source]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_BADGE_CLASS[record.stage]}`}
                    >
                      {STAGE_LABELS[record.stage]}
                    </span>
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate">
                    {record.note ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate">
                    {formatDate(record.visitedAt)}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {record.staff?.name ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(record)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-[#C55A11]/30 hover:text-[#C55A11] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <ActionModal
        open={isFormOpen}
        badgeLabel={editingId !== null ? "상담 방문자 수정" : "상담 방문자 등록"}
        badgeTone="default"
        title={editingId !== null ? "상담 방문자 수정" : "신규 상담 방문자 등록"}
        description={
          editingId !== null
            ? "상담 방문자 정보를 수정합니다."
            : "새 상담 방문자를 등록합니다. 이름은 필수 항목입니다."
        }
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={
          isPending ? "저장 중..." : editingId !== null ? "수정 저장" : "등록"
        }
        isPending={isPending}
        onClose={closeForm}
        onConfirm={handleSave}
      >
        <div className="space-y-4">
          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {/* 이름 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="예: 홍길동"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 연락처 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              연락처
              <span className="ml-1 text-xs font-normal text-slate">(선택)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="예: 010-1234-5678"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 시험유형 + 유입경로 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">시험유형</label>
              <select
                value={form.examType}
                onChange={(e) => setField("examType", e.target.value as ExamType | "")}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              >
                <option value="">선택 안 함</option>
                {(Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((t) => (
                  <option key={t} value={t}>
                    {EXAM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                유입경로 <span className="text-red-500">*</span>
              </label>
              <select
                value={form.source}
                onChange={(e) => setField("source", e.target.value as ProspectSource)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              >
                {(Object.keys(SOURCE_LABELS) as ProspectSource[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 단계 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">단계</label>
            <select
              value={form.stage}
              onChange={(e) => setField("stage", e.target.value as ProspectStage)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            >
              {(Object.keys(STAGE_LABELS) as ProspectStage[]).map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
            {form.stage === ProspectStage.REGISTERED ? (
              <p className="mt-1.5 text-xs text-[#1F4D3A]">
                수강 등록 연결은 수강 등록 메뉴에서 처리하세요.
              </p>
            ) : null}
          </div>

          {/* 방문일 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">방문일</label>
            <input
              type="date"
              value={form.visitedAt}
              onChange={(e) => setField("visitedAt", e.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 메모 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              메모
              <span className="ml-1 text-xs font-normal text-slate">(선택)</span>
            </label>
            <textarea
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              placeholder="상담 내용, 특이사항 등 자유롭게 입력하세요"
              rows={3}
              className="w-full resize-none rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* Delete button in edit mode */}
          {editingId !== null ? (
            <div className="border-t border-ink/10 pt-4">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const target = prospects.find((p) => p.id === editingId);
                  if (!target) return;
                  closeForm();
                  handleDelete(target);
                }}
                className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                기록 삭제
              </button>
            </div>
          ) : null}
        </div>
      </ActionModal>

      {/* Delete confirm modal */}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}
