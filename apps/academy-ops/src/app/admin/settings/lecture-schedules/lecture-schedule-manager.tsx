"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Cohort = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string;
  endDate: string;
};

type Schedule = {
  id: string;
  cohortId: string;
  subjectName: string;
  instructorName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  cohort: { id: string; name: string; examCategory: string; isActive: boolean };
  sessionCount: number;
};

type Props = {
  initialSchedules: Schedule[];
  cohorts: Cohort[];
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

type FormState = {
  cohortId: string;
  subjectName: string;
  instructorName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
};

const EMPTY_FORM: FormState = {
  cohortId: "",
  subjectName: "",
  instructorName: "",
  dayOfWeek: "1",
  startTime: "09:00",
  endTime: "11:00",
};

export function LectureScheduleManager({ initialSchedules, cohorts }: Props) {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filterCohortId, setFilterCohortId] = useState<string>("all");

  function openAdd() {
    setForm({ ...EMPTY_FORM, cohortId: cohorts[0]?.id ?? "" });
    setFormError(null);
    setEditingId(null);
    setShowAddModal(true);
  }

  function openEdit(schedule: Schedule) {
    setForm({
      cohortId: schedule.cohortId,
      subjectName: schedule.subjectName,
      instructorName: schedule.instructorName ?? "",
      dayOfWeek: String(schedule.dayOfWeek),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    });
    setFormError(null);
    setEditingId(schedule.id);
    setShowAddModal(true);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (!form.cohortId) throw new Error("기수를 선택하세요.");
      if (!form.subjectName.trim()) throw new Error("과목명을 입력하세요.");
      if (!form.startTime || !form.endTime) throw new Error("시간을 입력하세요.");

      const payload = {
        cohortId: form.cohortId,
        subjectName: form.subjectName.trim(),
        instructorName: form.instructorName.trim() || null,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/attendance/schedules/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/attendance/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리 실패");

      setShowAddModal(false);
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleActive(schedule: Schedule) {
    try {
      const res = await fetch(`/api/attendance/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !schedule.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리 실패");
      router.refresh();
    } catch {
      // silent
    }
  }

  async function handleDelete(scheduleId: string) {
    if (!confirm("이 스케줄을 삭제하시겠습니까? 연결된 세션과 출결 기록도 모두 삭제됩니다."))
      return;
    try {
      const res = await fetch(`/api/attendance/schedules/${scheduleId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      router.refresh();
    } catch {
      // silent
    }
  }

  // 필터링
  const filtered =
    filterCohortId === "all"
      ? schedules
      : schedules.filter((s) => s.cohortId === filterCohortId);

  // 기수별 그룹
  const cohortIds = [...new Set(filtered.map((s) => s.cohortId))];

  return (
    <div>
      {/* 상단 액션 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <select
            value={filterCohortId}
            onChange={(e) => setFilterCohortId(e.target.value)}
            className="rounded-xl border border-ink/10 bg-white px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30"
          >
            <option value="all">전체 기수</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({EXAM_CATEGORY_LABEL[c.examCategory] ?? c.examCategory})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember/90 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          스케줄 추가
        </button>
      </div>

      {/* 스케줄 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-[28px] border border-ink/8 bg-white p-12 text-center">
          <p className="text-base font-medium text-slate">등록된 스케줄이 없습니다.</p>
          <button
            onClick={openAdd}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember/90 transition-colors"
          >
            첫 번째 스케줄 추가
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {cohortIds.map((cohortId) => {
            const cohortSchedules = filtered.filter((s) => s.cohortId === cohortId);
            const cohortInfo = cohortSchedules[0]?.cohort;
            if (!cohortInfo) return null;

            return (
              <div key={cohortId} className="rounded-[28px] border border-ink/8 bg-white overflow-hidden shadow-sm">
                {/* 기수 헤더 */}
                <div className="flex items-center gap-3 border-b border-ink/8 bg-mist px-6 py-4">
                  <span className="text-base font-semibold text-ink">
                    {cohortInfo.name}
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                    {EXAM_CATEGORY_LABEL[cohortInfo.examCategory] ?? cohortInfo.examCategory}
                  </span>
                  {!cohortInfo.isActive && (
                    <span className="rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-xs font-medium text-slate">
                      종료된 기수
                    </span>
                  )}
                  <span className="ml-auto text-sm text-slate">
                    {cohortSchedules.length}개 스케줄
                  </span>
                </div>

                {/* 스케줄 행 */}
                <div className="divide-y divide-ink/6">
                  {cohortSchedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className={`flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between ${
                        !schedule.isActive ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold text-ink">
                          {schedule.subjectName}
                        </span>
                        <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-medium text-slate">
                          {DAY_LABELS[schedule.dayOfWeek]}요일
                        </span>
                        <span className="text-sm text-slate">
                          {schedule.startTime} ~ {schedule.endTime}
                        </span>
                        {schedule.instructorName && (
                          <span className="text-sm text-slate">
                            강사: {schedule.instructorName}
                          </span>
                        )}
                        {!schedule.isActive && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                            비활성
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => openEdit(schedule)}
                          className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-slate hover:bg-mist transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleToggleActive(schedule)}
                          className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-slate hover:bg-mist transition-colors"
                        >
                          {schedule.isActive ? "비활성화" : "활성화"}
                        </button>
                        <button
                          onClick={() => handleDelete(schedule.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
            <h2 className="mb-6 text-xl font-semibold text-ink">
              {editingId ? "스케줄 수정" : "스케줄 추가"}
            </h2>

            <div className="space-y-4">
              {/* 기수 선택 */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  기수 <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.cohortId}
                  onChange={(e) => setForm({ ...form, cohortId: e.target.value })}
                  disabled={!!editingId}
                  className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30 disabled:opacity-60"
                >
                  <option value="">기수 선택</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({EXAM_CATEGORY_LABEL[c.examCategory] ?? c.examCategory})
                    </option>
                  ))}
                </select>
              </div>

              {/* 과목명 */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  과목명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.subjectName}
                  onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
                  placeholder="예: 형법, 헌법, 형사소송법"
                  className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-ember/30"
                />
              </div>

              {/* 강사명 */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  강사명
                </label>
                <input
                  type="text"
                  value={form.instructorName}
                  onChange={(e) => setForm({ ...form, instructorName: e.target.value })}
                  placeholder="강사 이름 (선택)"
                  className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-ember/30"
                />
              </div>

              {/* 요일 */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  요일 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setForm({ ...form, dayOfWeek: String(i) })}
                      className={`h-9 w-9 rounded-xl text-sm font-semibold transition-colors border ${
                        form.dayOfWeek === String(i)
                          ? "bg-ember text-white border-ember"
                          : "bg-white text-slate border-ink/10 hover:bg-mist"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 시간 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink">
                    시작 시간 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink">
                    종료 시간 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30"
                  />
                </div>
              </div>
            </div>

            {formError && (
              <p className="mt-4 text-sm font-medium text-red-600">{formError}</p>
            )}

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-xl border border-ink/10 bg-white py-2.5 text-sm font-semibold text-slate hover:bg-mist transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-ember py-2.5 text-sm font-semibold text-white hover:bg-ember/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "처리 중..." : editingId ? "수정" : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
