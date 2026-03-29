"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ActionModal } from "@/components/ui/action-modal";
import type { SpecialLectureRow, InstructorOption } from "./page";

const LECTURE_TYPE_LABEL: Record<string, string> = {
  THEMED: "테마 특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접 코칭",
};

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

interface LectureForm {
  name: string;
  lectureType: string;
  examCategory: string;
  startDate: string;
  endDate: string;
  isMultiSubject: boolean;
  fullPackagePrice: string;
  hasLive: boolean;
  hasOffline: boolean;
  maxCapacityLive: string;
  maxCapacityOffline: string;
  waitlistAllowed: boolean;
  isActive: boolean;
}

const EMPTY_FORM: LectureForm = {
  name: "",
  lectureType: "SINGLE",
  examCategory: "",
  startDate: "",
  endDate: "",
  isMultiSubject: false,
  fullPackagePrice: "",
  hasLive: false,
  hasOffline: true,
  maxCapacityLive: "",
  maxCapacityOffline: "",
  waitlistAllowed: true,
  isActive: true,
};

interface SubjectForm {
  subjectName: string;
  instructorId: string;
  price: string;
  instructorRate: string;
}

const EMPTY_SUBJECT: SubjectForm = {
  subjectName: "",
  instructorId: "",
  price: "",
  instructorRate: "50",
};

interface Props {
  initialRows: SpecialLectureRow[];
  instructors: InstructorOption[];
}

export function SpecialLectureManager({ initialRows, instructors }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SpecialLectureRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SpecialLectureRow | null>(null);
  const [subjectTarget, setSubjectTarget] = useState<SpecialLectureRow | null>(null);
  const [editSubjectId, setEditSubjectId] = useState<string | null>(null);

  const [form, setForm] = useState<LectureForm>(EMPTY_FORM);
  const [subjectForm, setSubjectForm] = useState<SubjectForm>(EMPTY_SUBJECT);
  const [error, setError] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const displayed = showInactive ? initialRows : initialRows.filter((r) => r.isActive);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreateOpen(true);
  }

  function openEdit(row: SpecialLectureRow) {
    setForm({
      name: row.name,
      lectureType: row.lectureType,
      examCategory: row.examCategory ?? "",
      startDate: row.startDate,
      endDate: row.endDate,
      isMultiSubject: row.isMultiSubject,
      fullPackagePrice: row.fullPackagePrice ? String(row.fullPackagePrice) : "",
      hasLive: row.hasLive,
      hasOffline: row.hasOffline,
      maxCapacityLive: row.maxCapacityLive ? String(row.maxCapacityLive) : "",
      maxCapacityOffline: row.maxCapacityOffline ? String(row.maxCapacityOffline) : "",
      waitlistAllowed: row.waitlistAllowed,
      isActive: row.isActive,
    });
    setError(null);
    setEditTarget(row);
  }

  function handleCreate() {
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      setError("강좌명, 시작일, 종료일을 입력하세요."); return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/special-lectures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            lectureType: form.lectureType,
            examCategory: form.examCategory || null,
            startDate: form.startDate,
            endDate: form.endDate,
            isMultiSubject: form.isMultiSubject,
            fullPackagePrice: form.isMultiSubject && form.fullPackagePrice ? Number(form.fullPackagePrice) : null,
            hasLive: form.hasLive,
            hasOffline: form.hasOffline,
            maxCapacityLive: form.hasLive && form.maxCapacityLive ? Number(form.maxCapacityLive) : null,
            maxCapacityOffline: form.hasOffline && form.maxCapacityOffline ? Number(form.maxCapacityOffline) : null,
            waitlistAllowed: form.waitlistAllowed,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "등록 실패");
        setCreateOpen(false);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "등록 실패"); }
    });
  }

  function handleEdit() {
    if (!editTarget || !form.name.trim() || !form.startDate || !form.endDate) {
      setError("강좌명, 시작일, 종료일을 입력하세요."); return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/special-lectures/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            lectureType: form.lectureType,
            examCategory: form.examCategory || null,
            startDate: form.startDate,
            endDate: form.endDate,
            isMultiSubject: form.isMultiSubject,
            fullPackagePrice: form.isMultiSubject && form.fullPackagePrice ? Number(form.fullPackagePrice) : null,
            hasLive: form.hasLive,
            hasOffline: form.hasOffline,
            maxCapacityLive: form.hasLive && form.maxCapacityLive ? Number(form.maxCapacityLive) : null,
            maxCapacityOffline: form.hasOffline && form.maxCapacityOffline ? Number(form.maxCapacityOffline) : null,
            waitlistAllowed: form.waitlistAllowed,
            isActive: form.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setEditTarget(null);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "수정 실패"); }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/special-lectures/${deleteTarget.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "삭제 실패");
        setDeleteTarget(null);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "삭제 실패"); }
    });
  }

  function openAddSubject(row: SpecialLectureRow) {
    setSubjectForm(EMPTY_SUBJECT);
    setSubjectError(null);
    setEditSubjectId(null);
    setSubjectTarget(row);
  }

  function openEditSubject(row: SpecialLectureRow, subjectId: string) {
    const s = row.subjects.find((x) => x.id === subjectId);
    if (!s) return;
    setSubjectForm({
      subjectName: s.subjectName,
      instructorId: s.instructorId,
      price: String(s.price),
      instructorRate: String(s.instructorRate),
    });
    setSubjectError(null);
    setEditSubjectId(subjectId);
    setSubjectTarget(row);
  }

  function handleSaveSubject() {
    if (!subjectTarget) return;
    if (!subjectForm.subjectName.trim() || !subjectForm.instructorId || !subjectForm.price) {
      setSubjectError("과목명, 강사, 수강료를 입력하세요."); return;
    }
    startTransition(async () => {
      try {
        const url = editSubjectId
          ? `/api/special-lectures/${subjectTarget.id}/subjects/${editSubjectId}`
          : `/api/special-lectures/${subjectTarget.id}/subjects`;
        const method = editSubjectId ? "PATCH" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectName: subjectForm.subjectName.trim(),
            instructorId: subjectForm.instructorId,
            price: Number(subjectForm.price),
            instructorRate: Number(subjectForm.instructorRate),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "저장 실패");
        setSubjectTarget(null);
        setEditSubjectId(null);
        router.refresh();
      } catch (e) { setSubjectError(e instanceof Error ? e.message : "저장 실패"); }
    });
  }

  function handleDeleteSubject(row: SpecialLectureRow, subjectId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/special-lectures/${row.id}/subjects/${subjectId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "삭제 실패");
        }
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "삭제 실패"); }
    });
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-sm text-slate cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-ink/20"
          />
          비활성 강좌 포함
        </label>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/settings/special-lectures/new"
            className="rounded-[28px] bg-ember px-4 py-2 text-sm font-semibold text-white hover:bg-ember/90"
          >
            새 특강 등록
          </Link>
          <button
            onClick={openCreate}
            className="rounded-[28px] bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
          >
            + 특강 추가
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {displayed.length === 0 ? (
          <div className="rounded-[20px] border border-ink/10 py-12 text-center text-sm text-slate">
            등록된 특강·단과가 없습니다.
          </div>
        ) : (
          displayed.map((row) => (
            <div
              key={row.id}
              className={`rounded-[20px] border border-ink/10 bg-white overflow-hidden ${!row.isActive ? "opacity-60" : ""}`}
            >
              {/* Header */}
              <div className="px-6 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-ink">{row.name}</p>
                    <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-slate">
                      {LECTURE_TYPE_LABEL[row.lectureType] ?? row.lectureType}
                    </span>
                    {row.examCategory && (
                      <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs text-forest">
                        {EXAM_CATEGORY_LABEL[row.examCategory] ?? row.examCategory}
                      </span>
                    )}
                    {!row.isActive && (
                      <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-slate">비활성</span>
                    )}
                  </div>
                  <p className="text-xs text-slate mt-1">
                    {row.startDate} ~ {row.endDate}
                    {row.enrollmentCount > 0 && (
                      <span className="ml-2 text-forest font-medium">수강생 {row.enrollmentCount}명</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/admin/settings/special-lectures/${row.id}`}
                    className="text-xs text-forest font-medium hover:text-ink"
                  >
                    상세
                  </Link>
                  <button onClick={() => openAddSubject(row)} className="text-xs text-forest hover:text-ink font-medium">
                    + 과목 추가
                  </button>
                  <button onClick={() => openEdit(row)} className="text-xs text-slate hover:text-ink">
                    수정
                  </button>
                  <button onClick={() => setDeleteTarget(row)} className="text-xs text-red-400 hover:text-red-600">
                    삭제
                  </button>
                </div>
              </div>

              {/* Subjects */}
              {row.subjects.length > 0 && (
                <div className="border-t border-ink/5">
                  <table className="min-w-full text-sm divide-y divide-ink/5">
                    <thead>
                      <tr className="bg-mist/50">
                        {["과목명", "강사", "수강료", "배분율", "강사 수령", ""].map((h) => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {row.subjects.map((s) => (
                        <tr key={s.id} className="hover:bg-mist/20">
                          <td className="px-4 py-2.5 text-ink font-medium">{s.subjectName}</td>
                          <td className="px-4 py-2.5 text-slate">{s.instructorName}</td>
                          <td className="px-4 py-2.5 tabular-nums text-slate whitespace-nowrap">
                            {s.price.toLocaleString()}원
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-slate">{s.instructorRate}%</td>
                          <td className="px-4 py-2.5 tabular-nums text-ember font-semibold whitespace-nowrap">
                            {Math.round(s.price * s.instructorRate / 100).toLocaleString()}원
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => openEditSubject(row, s.id)}
                              className="text-xs text-slate hover:text-ink mr-2"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => handleDeleteSubject(row, s.id)}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                      {row.isMultiSubject && row.fullPackagePrice && (
                        <tr className="bg-mist/30">
                          <td colSpan={2} className="px-4 py-2.5 text-xs text-slate font-medium">패키지 일괄 가격</td>
                          <td className="px-4 py-2.5 tabular-nums text-ink font-semibold whitespace-nowrap" colSpan={4}>
                            {row.fullPackagePrice.toLocaleString()}원
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {row.subjects.length === 0 && (
                <div className="border-t border-ink/5 px-6 py-3 text-xs text-slate">
                  과목이 없습니다. 과목을 추가하세요.
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      <ActionModal
        open={createOpen}
        badgeLabel="특강 관리"
        title="특강 추가"
        description="새 특강 또는 단과 강좌를 등록합니다."
        confirmLabel="추가"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        panelClassName="max-w-lg"
      >
        <LectureForm form={form} onChange={setForm} error={error} />
      </ActionModal>

      {/* Edit Modal */}
      <ActionModal
        open={!!editTarget}
        badgeLabel="특강 관리"
        title="특강 수정"
        description={`"${editTarget?.name}" 강좌 정보를 수정합니다.`}
        confirmLabel="저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEdit}
        panelClassName="max-w-lg"
      >
        <LectureForm form={form} onChange={setForm} error={error} showActive />
      </ActionModal>

      {/* Delete Modal */}
      <ActionModal
        open={!!deleteTarget}
        badgeLabel="특강 관리"
        title="강좌 삭제"
        description={`"${deleteTarget?.name}"을(를) 삭제합니다. 수강생이 있으면 삭제되지 않습니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmTone="danger"
      />

      {/* Subject Modal */}
      <ActionModal
        open={!!subjectTarget}
        badgeLabel="과목 관리"
        title={editSubjectId ? "과목 수정" : "과목 추가"}
        description={editSubjectId ? "과목 정보를 수정합니다." : `"${subjectTarget?.name}" 과목을 추가합니다.`}
        confirmLabel={editSubjectId ? "저장" : "추가"}
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => { setSubjectTarget(null); setEditSubjectId(null); }}
        onConfirm={handleSaveSubject}
        panelClassName="max-w-md"
      >
        <SubjectFormEl form={subjectForm} onChange={setSubjectForm} error={subjectError} instructors={instructors} />
      </ActionModal>
    </div>
  );
}

function LectureForm({
  form,
  onChange,
  error,
  showActive = false,
}: {
  form: LectureForm;
  onChange: (f: LectureForm) => void;
  error: string | null;
  showActive?: boolean;
}) {
  return (
    <div className="space-y-3 pt-2">
      {error && <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate">강좌명 *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="예: 2026 형사법 기초 특강"
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">강좌 유형 *</label>
          <select
            value={form.lectureType}
            onChange={(e) => onChange({ ...form, lectureType: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          >
            <option value="SINGLE">단과</option>
            <option value="THEMED">테마 특강</option>
            <option value="INTERVIEW_COACHING">면접 코칭</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">수험 유형</label>
          <select
            value={form.examCategory}
            onChange={(e) => onChange({ ...form, examCategory: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          >
            <option value="">공통 (전체)</option>
            <option value="GONGCHAE">공채</option>
            <option value="GYEONGCHAE">경채</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">시작일 *</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => onChange({ ...form, startDate: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">종료일 *</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => onChange({ ...form, endDate: e.target.value })}
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate cursor-pointer">
        <input
          type="checkbox"
          checked={form.isMultiSubject}
          onChange={(e) => onChange({ ...form, isMultiSubject: e.target.checked })}
          className="rounded border-ink/20"
        />
        복합 과목 (여러 과목 묶음)
      </label>

      {form.isMultiSubject && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">패키지 가격 (개별 합산 대신 일괄 적용 시)</label>
          <input
            type="number"
            value={form.fullPackagePrice}
            onChange={(e) => onChange({ ...form, fullPackagePrice: e.target.value })}
            placeholder="0"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">오프라인 정원</label>
          <input
            type="number"
            value={form.maxCapacityOffline}
            onChange={(e) => onChange({ ...form, maxCapacityOffline: e.target.value })}
            placeholder="무제한"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">라이브 정원</label>
          <input
            type="number"
            value={form.maxCapacityLive}
            onChange={(e) => onChange({ ...form, maxCapacityLive: e.target.value })}
            disabled={!form.hasLive}
            placeholder="라이브 미사용"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest disabled:opacity-40"
          />
        </div>
      </div>

      <div className="flex gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-slate cursor-pointer">
          <input
            type="checkbox"
            checked={form.hasLive}
            onChange={(e) => onChange({ ...form, hasLive: e.target.checked })}
            className="rounded border-ink/20"
          />
          라이브 지원
        </label>
        <label className="flex items-center gap-2 text-sm text-slate cursor-pointer">
          <input
            type="checkbox"
            checked={form.waitlistAllowed}
            onChange={(e) => onChange({ ...form, waitlistAllowed: e.target.checked })}
            className="rounded border-ink/20"
          />
          대기 등록 허용
        </label>
      </div>

      {showActive && (
        <label className="flex items-center gap-2 text-sm text-slate cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
            className="rounded border-ink/20"
          />
          활성 상태
        </label>
      )}
    </div>
  );
}

function SubjectFormEl({
  form,
  onChange,
  error,
  instructors,
}: {
  form: SubjectForm;
  onChange: (f: SubjectForm) => void;
  error: string | null;
  instructors: InstructorOption[];
}) {
  const academyShare = form.price && form.instructorRate
    ? Math.round(Number(form.price) * (100 - Number(form.instructorRate)) / 100)
    : 0;
  const instructorShare = form.price && form.instructorRate
    ? Math.round(Number(form.price) * Number(form.instructorRate) / 100)
    : 0;

  return (
    <div className="space-y-3 pt-2">
      {error && <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate">과목명 *</label>
        <input
          type="text"
          value={form.subjectName}
          onChange={(e) => onChange({ ...form, subjectName: e.target.value })}
          placeholder="예: 형사법"
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate">담당 강사 *</label>
        <select
          value={form.instructorId}
          onChange={(e) => onChange({ ...form, instructorId: e.target.value })}
          className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
        >
          <option value="">강사 선택</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.subject})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">수강료 (원) *</label>
          <input
            type="number"
            value={form.price}
            onChange={(e) => onChange({ ...form, price: e.target.value })}
            placeholder="0"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">강사 배분율 (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.instructorRate}
            onChange={(e) => onChange({ ...form, instructorRate: e.target.value })}
            placeholder="50"
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>

      {form.price && form.instructorRate && (
        <div className="rounded-[12px] bg-mist/60 px-4 py-3 text-xs flex gap-6">
          <span>강사 수령 <span className="font-semibold text-ember tabular-nums">{instructorShare.toLocaleString()}원</span></span>
          <span>학원 수입 <span className="font-semibold text-forest tabular-nums">{academyShare.toLocaleString()}원</span></span>
        </div>
      )}
    </div>
  );
}
