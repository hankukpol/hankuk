"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import type { ClassroomRow } from "@/app/admin/classrooms/page";
import { ROLE_LABEL } from "@/lib/constants";

interface Teacher {
  id: string;
  name: string;
  role: AdminRole;
}

interface Props {
  initialClassrooms: ClassroomRow[];
  teachers: Teacher[];
}

interface FormState {
  name: string;
  teacherId: string;
  generation: string;
  note: string;
}

const EMPTY_FORM: FormState = { name: "", teacherId: "", generation: "", note: "" };

export function ClassroomManager({ initialClassrooms, teachers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClassroomRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassroomRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreateOpen(true);
  }

  function openEdit(classroom: ClassroomRow) {
    setForm({
      name: classroom.name,
      teacherId: classroom.teacherId,
      generation: classroom.generation?.toString() ?? "",
      note: classroom.note ?? "",
    });
    setError(null);
    setEditTarget(classroom);
  }

  function handleCreate() {
    if (!form.name.trim() || !form.teacherId) {
      setError("반 이름과 담임 선생님을 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/classrooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            teacherId: form.teacherId,
            generation: form.generation ? Number(form.generation) : null,
            note: form.note.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "생성 실패");
        setCreateOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "생성 실패");
      }
    });
  }

  function handleEdit() {
    if (!editTarget) return;
    if (!form.name.trim() || !form.teacherId) {
      setError("반 이름과 담임 선생님을 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            teacherId: form.teacherId,
            generation: form.generation ? Number(form.generation) : null,
            note: form.note.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setEditTarget(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/classrooms/${deleteTarget.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("삭제 실패");
        setDeleteTarget(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate">
          총 <span className="font-semibold text-ink">{initialClassrooms.length}</span>개 반
        </p>
        <button
          onClick={openCreate}
          className="rounded-[28px] bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest"
        >
          + 담임반 추가
        </button>
      </div>

      {initialClassrooms.length === 0 ? (
        <div className="rounded-[28px] border border-ink/10 bg-mist/50 py-16 text-center">
          <p className="text-slate">등록된 담임반이 없습니다.</p>
          <button
            onClick={openCreate}
            className="mt-4 rounded-[28px] border border-ink/20 px-4 py-2 text-sm text-slate hover:border-ink/40"
          >
            첫 담임반 만들기
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {initialClassrooms.map((c) => (
            <div
              key={c.id}
              className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink text-lg">{c.name}</p>
                  {c.generation && (
                    <span className="mt-1 inline-block rounded-full bg-forest/10 px-2 py-0.5 text-xs text-forest">
                      {c.generation}기
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Link
                    href={`/admin/classrooms/${c.id}`}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-forest hover:bg-forest/10"
                  >
                    관리
                  </Link>
                  <button
                    onClick={() => openEdit(c)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-slate hover:bg-ink/5"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-slate">
                <span>담임: {c.teacher.name}</span>
                <span className="font-medium text-ink">{c._count.students}명</span>
              </div>
              {c.note && (
                <p className="mt-2 text-xs text-slate line-clamp-2">{c.note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <ActionModal
        open={createOpen}
        badgeLabel="담임반 관리"
        title="담임반 추가"
        description="새로운 담임반을 등록합니다."
        confirmLabel="추가"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        panelClassName="max-w-lg"
      >
        <ClassroomForm
          form={form}
          onChange={setForm}
          teachers={teachers}
          error={error}
        />
      </ActionModal>

      {/* Edit Modal */}
      <ActionModal
        open={!!editTarget}
        badgeLabel="담임반 관리"
        title="담임반 수정"
        description={`"${editTarget?.name}" 정보를 수정합니다.`}
        confirmLabel="저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEdit}
        panelClassName="max-w-lg"
      >
        <ClassroomForm
          form={form}
          onChange={setForm}
          teachers={teachers}
          error={error}
        />
      </ActionModal>

      {/* Delete Modal */}
      <ActionModal
        open={!!deleteTarget}
        badgeLabel="담임반 관리"
        badgeTone="warning"
        title="담임반 비활성화"
        description={`"${deleteTarget?.name}" 반을 비활성화합니다. 기존 출결 기록은 보존됩니다.`}
        confirmLabel="비활성화"
        confirmTone="danger"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ClassroomForm({
  form,
  onChange,
  teachers,
  error,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  teachers: Teacher[];
  error: string | null;
}) {
  const set = (k: keyof FormState, v: string) => onChange({ ...form, [k]: v });

  return (
    <div className="space-y-4 pt-2">
      {error && (
        <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate">반 이름 *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="예: 공채 A반"
          className="w-full rounded-[12px] border border-ink/20 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate">담임 선생님 *</label>
        <select
          value={form.teacherId}
          onChange={(e) => set("teacherId", e.target.value)}
          className="w-full rounded-[12px] border border-ink/20 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
        >
          <option value="">선생님 선택</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({ROLE_LABEL[t.role]})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate">담당 기수 (선택)</label>
        <input
          type="number"
          value={form.generation}
          onChange={(e) => set("generation", e.target.value)}
          placeholder="예: 52"
          className="w-full rounded-[12px] border border-ink/20 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate">메모 (선택)</label>
        <textarea
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
          placeholder="반에 대한 메모"
          className="w-full rounded-[12px] border border-ink/20 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest resize-none"
        />
      </div>
    </div>
  );
}
