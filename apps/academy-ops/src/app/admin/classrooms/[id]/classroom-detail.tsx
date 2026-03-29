"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AttendType, StudentStatus } from "@prisma/client";
import { ATTEND_TYPE_LABEL } from "@/lib/constants";
import { ActionModal } from "@/components/ui/action-modal";
import type { ClassroomData, ClassroomStudentRow, AttendanceLogRow } from "./page";
import { AttendanceMonthlyView } from "./attendance-monthly-view";

interface SearchStudent {
  examNumber: string;
  name: string;
  generation: number | null;
}

const ATTEND_TYPE_COLOR: Record<AttendType, string> = {
  NORMAL: "bg-forest/10 text-forest",
  LIVE: "bg-sky-100 text-sky-800",
  EXCUSED: "bg-amber-100 text-amber-800",
  ABSENT: "bg-red-100 text-red-700",
};

const STATUS_COLOR: Record<StudentStatus, string> = {
  NORMAL: "",
  WARNING_1: "text-amber-600",
  WARNING_2: "text-orange-600",
  DROPOUT: "text-red-600",
};

interface AttendLog {
  examNumber: string;
  attendType: AttendType;
  source: string;
}

type TabKey = "today" | "monthly";

interface Props {
  classroom: ClassroomData;
  todayLogMap: Record<string, AttendLog>;
  todayDate: string;
  attendanceLogs: AttendanceLogRow[];
  defaultMonth: string;
}

export function ClassroomDetail({ classroom, todayLogMap, todayDate, attendanceLogs, defaultMonth }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabKey>("today");

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchStudent[]>([]);
  const [addSelected, setAddSelected] = useState<string[]>([]);
  const [removeTarget, setRemoveTarget] = useState<ClassroomStudentRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit attendance state
  const [editLog, setEditLog] = useState<{ examNumber: string; current: AttendType } | null>(
    null,
  );
  const [logMap, setLogMap] = useState<Record<string, AttendLog>>(todayLogMap);

  async function searchStudents(q: string) {
    if (!q.trim()) { setAddResults([]); return; }
    try {
      const res = await fetch(`/api/students?search=${encodeURIComponent(q)}&limit=10`);
      const data = await res.json();
      setAddResults(data.students ?? []);
    } catch {
      setAddResults([]);
    }
  }

  function handleAdd() {
    if (addSelected.length === 0) {
      setError("학생을 선택하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${classroom.id}/students`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examNumbers: addSelected }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "추가 실패");
        setAddOpen(false);
        setAddSelected([]);
        setAddQuery("");
        setAddResults([]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "추가 실패");
      }
    });
  }

  function handleRemove() {
    if (!removeTarget) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${classroom.id}/students`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examNumber: removeTarget.examNumber }),
        });
        if (!res.ok) throw new Error("제거 실패");
        setRemoveTarget(null);
        router.refresh();
      } catch {
        setError("제거 실패");
      }
    });
  }

  function handleEditLog(examNumber: string, newType: AttendType) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${classroom.id}/attendance/logs`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examNumber, attendDate: todayDate.slice(0, 10), attendType: newType }),
        });
        if (!res.ok) throw new Error("수정 실패");
        setLogMap((prev) => ({ ...prev, [examNumber]: { examNumber, attendType: newType, source: "MANUAL" } }));
        setEditLog(null);
      } catch {
        // ignore
      }
    });
  }

  const presentCount = classroom.students.filter(
    (s) => logMap[s.examNumber]?.attendType === AttendType.NORMAL,
  ).length;
  const absentCount = classroom.students.filter(
    (s) => logMap[s.examNumber]?.attendType === AttendType.ABSENT,
  ).length;
  const noLogCount = classroom.students.filter((s) => !logMap[s.examNumber]).length;

  // Students list for monthly view
  const studentsForMonthly = classroom.students.map((s) => ({
    examNumber: s.examNumber,
    name: s.student.name,
    generation: s.student.generation,
  }));

  return (
    <div>
      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 rounded-[16px] border border-ink/10 bg-mist/50 p-1 w-fit">
        <button
          onClick={() => setActiveTab("today")}
          className={`rounded-[12px] px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "today"
              ? "bg-white shadow-sm text-ink"
              : "text-slate hover:text-ink"
          }`}
        >
          오늘 출결
        </button>
        <button
          onClick={() => setActiveTab("monthly")}
          className={`rounded-[12px] px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "monthly"
              ? "bg-white shadow-sm text-ink"
              : "text-slate hover:text-ink"
          }`}
        >
          월간 출결
        </button>
      </div>

      {/* Monthly attendance tab */}
      {activeTab === "monthly" && (
        <AttendanceMonthlyView
          students={studentsForMonthly}
          attendanceLogs={attendanceLogs}
          month={defaultMonth}
        />
      )}

      {/* Today's attendance tab */}
      {activeTab === "today" && (
      <div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5 text-center">
          <p className="text-2xl font-bold text-forest">{presentCount}</p>
          <p className="text-xs text-slate mt-1">출석</p>
        </div>
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-2xl font-bold text-red-600">{absentCount}</p>
          <p className="text-xs text-slate mt-1">결석</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 p-5 text-center">
          <p className="text-2xl font-bold text-slate">{noLogCount}</p>
          <p className="text-xs text-slate mt-1">미입력</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">재적 학생 ({classroom.students.length}명)</h2>
        <div className="flex gap-2">
          <Link
            href={`/admin/classrooms/${classroom.id}/attendance/parse`}
            className="rounded-[28px] border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest hover:bg-forest/20"
          >
            카카오 출석 파싱
          </Link>
          <button
            onClick={() => { setAddOpen(true); setError(null); }}
            className="rounded-[28px] bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
          >
            + 학생 추가
          </button>
        </div>
      </div>

      {/* Student table */}
      <div className="rounded-[20px] border border-ink/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-mist border-b border-ink/10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate">학생</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate">기수</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate">오늘 출결</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {classroom.students.map((cs) => {
              const log = logMap[cs.examNumber];
              return (
                <tr key={cs.id} className="hover:bg-mist/40">
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${STATUS_COLOR[cs.student.currentStatus]}`}
                    >
                      {cs.student.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {cs.student.generation ? `${cs.student.generation}기` : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {log ? (
                      <button
                        onClick={() =>
                          setEditLog({ examNumber: cs.examNumber, current: log.attendType })
                        }
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ATTEND_TYPE_COLOR[log.attendType]}`}
                      >
                        {ATTEND_TYPE_LABEL[log.attendType]}
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          setEditLog({ examNumber: cs.examNumber, current: AttendType.NORMAL })
                        }
                        className="rounded-full px-2 py-0.5 text-xs text-slate hover:bg-ink/5"
                      >
                        미입력
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setRemoveTarget(cs)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      제거
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
      )}

      {/* Add student modal */}
      <ActionModal
        open={addOpen}
        badgeLabel="학생 추가"
        title="담임반에 학생 추가"
        description="학생을 검색하여 담임반에 추가합니다."
        confirmLabel="추가"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => { setAddOpen(false); setAddSelected([]); setAddQuery(""); setAddResults([]); }}
        onConfirm={handleAdd}
        panelClassName="max-w-lg"
      >
        <div className="space-y-3 pt-2">
          {error && (
            <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}
          <input
            type="text"
            value={addQuery}
            onChange={(e) => { setAddQuery(e.target.value); searchStudents(e.target.value); }}
            placeholder="이름 또는 수험번호 검색"
            className="w-full rounded-[12px] border border-ink/20 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
          {addResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-[12px] border border-ink/10">
              {addResults.map((s) => (
                <label
                  key={s.examNumber}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-mist/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={addSelected.includes(s.examNumber)}
                    onChange={(e) =>
                      setAddSelected((prev) =>
                        e.target.checked
                          ? [...prev, s.examNumber]
                          : prev.filter((x) => x !== s.examNumber),
                      )
                    }
                    className="accent-forest"
                  />
                  <span className="text-sm">
                    {s.name}
                    {s.generation && (
                      <span className="ml-1 text-xs text-slate">{s.generation}기</span>
                    )}
                  </span>
                  <span className="ml-auto text-xs text-slate">{s.examNumber}</span>
                </label>
              ))}
            </div>
          )}
          {addSelected.length > 0 && (
            <p className="text-xs text-forest">{addSelected.length}명 선택됨</p>
          )}
        </div>
      </ActionModal>

      {/* Remove confirm modal */}
      <ActionModal
        open={!!removeTarget}
        badgeLabel="학생 제거"
        badgeTone="warning"
        title="담임반에서 제거"
        description={`"${removeTarget?.student.name}"을(를) 담임반에서 제거합니다. 출결 기록은 보존됩니다.`}
        confirmLabel="제거"
        confirmTone="danger"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
      />

      {/* Edit attendance modal */}
      <ActionModal
        open={!!editLog}
        badgeLabel="출결 수정"
        title="오늘 출결 수기 입력"
        description="출결 상태를 선택합니다."
        confirmLabel="저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditLog(null)}
        onConfirm={() => editLog && handleEditLog(editLog.examNumber, editLog.current)}
        panelClassName="max-w-sm"
      >
        <div className="grid grid-cols-2 gap-2 pt-2">
          {(Object.keys(ATTEND_TYPE_LABEL) as AttendType[]).map((type) => (
            <button
              key={type}
              onClick={() => setEditLog((prev) => prev ? { ...prev, current: type } : null)}
              className={`rounded-[12px] border py-3 text-sm font-medium transition-colors ${
                editLog?.current === type
                  ? "border-forest bg-forest/10 text-forest"
                  : "border-ink/15 text-slate hover:border-forest/40"
              }`}
            >
              {ATTEND_TYPE_LABEL[type]}
            </button>
          ))}
        </div>
      </ActionModal>
    </div>
  );
}
