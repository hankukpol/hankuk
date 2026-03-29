"use client";

import { AcademyType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import {
  ACADEMY_TYPE_LABEL,
  type AcademySummaryRow,
} from "@/lib/super-admin";
import { SwitchAcademyAction } from "../switch-academy-action";

type AcademyForm = {
  code: string;
  name: string;
  type: AcademyType;
};

const EMPTY_FORM: AcademyForm = {
  code: "",
  name: "",
  type: AcademyType.POLICE,
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}

export function AcademyManager({
  initialAcademies,
  openCreateInitially = false,
}: {
  initialAcademies: AcademySummaryRow[];
  openCreateInitially?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(openCreateInitially);
  const [createForm, setCreateForm] = useState<AcademyForm>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AcademySummaryRow | null>(null);
  const [editForm, setEditForm] = useState<AcademyForm>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<AcademySummaryRow | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    if (openCreateInitially) {
      setCreateForm(EMPTY_FORM);
      setCreateError(null);
      setCreateOpen(true);
    }
  }, [openCreateInitially]);

  const summary = useMemo(() => {
    const activeAcademies = initialAcademies.filter((academy) => academy.isActive).length;
    const totalStudents = initialAcademies.reduce((sum, academy) => sum + academy.studentCount, 0);
    const totalAdmins = initialAcademies.reduce((sum, academy) => sum + academy.adminCount, 0);

    return {
      activeAcademies,
      totalStudents,
      totalAdmins,
    };
  }, [initialAcademies]);

  function openCreate() {
    setCreateForm(EMPTY_FORM);
    setCreateError(null);
    setCreateOpen(true);
  }

  function openEdit(academy: AcademySummaryRow) {
    setEditTarget(academy);
    setEditForm({
      code: academy.code,
      name: academy.name,
      type: academy.type,
    });
    setEditError(null);
  }

  function submitCreate() {
    startTransition(async () => {
      setCreateError(null);

      const response = await fetch("/api/academies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const payload = await response.json().catch(() => ({ error: "지점 생성에 실패했습니다." }));

      if (!response.ok) {
        setCreateError(typeof payload?.error === "string" ? payload.error : "지점 생성에 실패했습니다.");
        return;
      }

      setCreateOpen(false);
      router.refresh();
    });
  }

  function submitEdit() {
    if (!editTarget) {
      return;
    }

    startTransition(async () => {
      setEditError(null);

      const response = await fetch(`/api/academies/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = await response.json().catch(() => ({ error: "지점 수정에 실패했습니다." }));

      if (!response.ok) {
        setEditError(typeof payload?.error === "string" ? payload.error : "지점 수정에 실패했습니다.");
        return;
      }

      setEditTarget(null);
      router.refresh();
    });
  }

  function submitToggle() {
    if (!toggleTarget) {
      return;
    }

    startTransition(async () => {
      setToggleError(null);

      const response = await fetch(`/api/academies/${toggleTarget.id}/toggle`, {
        method: "PATCH",
      });
      const payload = await response.json().catch(() => ({ error: "지점 상태 변경에 실패했습니다." }));

      if (!response.ok) {
        setToggleError(typeof payload?.error === "string" ? payload.error : "지점 상태 변경에 실패했습니다.");
        return;
      }

      setToggleTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">활성 지점</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{summary.activeAcademies}</p>
          <p className="mt-2 text-sm text-slate">전체 {initialAcademies.length}개 지점 중 운영 중인 지점 수</p>
        </section>
        <section className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">전체 학생</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{summary.totalStudents.toLocaleString("ko-KR")}</p>
          <p className="mt-2 text-sm text-slate">지점별 학생 수 합계</p>
        </section>
        <section className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">관리자 계정</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{summary.totalAdmins.toLocaleString("ko-KR")}</p>
          <p className="mt-2 text-sm text-slate">지점별 관리자 계정 합계</p>
        </section>
      </div>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">전체 지점 목록</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              지점 생성, 기본 정보 연결, 운영 상태 전환을 이 화면에서 처리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            새 지점 만들기
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-mist text-slate">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">지점</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">코드</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">유형</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">학생</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">관리자</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em]">상태</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em]">생성일</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {initialAcademies.map((academy) => (
                  <tr key={academy.id} className="align-top">
                    <td className="px-4 py-4 font-semibold text-ink">{academy.id}</td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-ink">{academy.name}</p>
                    </td>
                    <td className="px-4 py-4 text-slate">{academy.code}</td>
                    <td className="px-4 py-4 text-slate">{ACADEMY_TYPE_LABEL[academy.type]}</td>
                    <td className="px-4 py-4 text-right text-ink">{academy.studentCount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-4 text-right text-ink">{academy.adminCount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          academy.isActive
                            ? "border-forest/20 bg-forest/10 text-forest"
                            : "border-ink/10 bg-ink/5 text-slate"
                        }`}
                      >
                        {academy.isActive ? "운영 중" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-slate">{formatDate(academy.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <SwitchAcademyAction academyId={academy.id} href="/admin/settings/academy" label="기본 정보" />
                        <button
                          type="button"
                          onClick={() => openEdit(academy)}
                          className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-forest hover:text-forest"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setToggleTarget(academy);
                            setToggleError(null);
                          }}
                          className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-red-300 hover:text-red-600"
                        >
                          {academy.isActive ? "비활성화" : "재활성화"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ActionModal
        open={createOpen}
        badgeLabel="지점 관리"
        title="새 지점 만들기"
        description="지점 코드, 지점명, 지점 유형을 입력하면 기본 학원 설정과 시험 과목 마스터가 함께 준비됩니다."
        confirmLabel="지점 생성"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={submitCreate}
        panelClassName="max-w-lg"
      >
        <AcademyFormFields form={createForm} setForm={setCreateForm} error={createError} />
      </ActionModal>

      <ActionModal
        open={editTarget !== null}
        badgeLabel="지점 관리"
        title="지점 정보 수정"
        description="지점 코드와 표시명, 유형을 수정합니다. 기존 데이터와 지점 컨텍스트는 그대로 유지됩니다."
        confirmLabel="변경 저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={submitEdit}
        panelClassName="max-w-lg"
      >
        <AcademyFormFields form={editForm} setForm={setEditForm} error={editError} />
      </ActionModal>

      <ActionModal
        open={toggleTarget !== null}
        badgeLabel="운영 상태"
        title={toggleTarget?.isActive ? "지점을 비활성화합니다" : "지점을 다시 활성화합니다"}
        description={
          toggleTarget?.isActive
            ? "비활성화한 지점은 지점 관리자가 기본 운영 화면에서 사용할 수 없습니다. 기존 데이터는 유지됩니다."
            : "재활성화하면 지점 관리자가 다시 같은 데이터로 운영을 이어갈 수 있습니다."
        }
        confirmLabel={toggleTarget?.isActive ? "비활성화" : "재활성화"}
        cancelLabel="취소"
        confirmTone={toggleTarget?.isActive ? "danger" : "default"}
        isPending={isPending}
        onClose={() => setToggleTarget(null)}
        onConfirm={submitToggle}
      >
        <div className="space-y-2 text-sm text-slate">
          <p>
            대상 지점: <span className="font-semibold text-ink">{toggleTarget?.name}</span>
          </p>
          {toggleError ? <p className="text-red-600">{toggleError}</p> : null}
        </div>
      </ActionModal>
    </div>
  );
}

function AcademyFormFields({
  form,
  setForm,
  error,
}: {
  form: AcademyForm;
  setForm: Dispatch<SetStateAction<AcademyForm>>;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">지점 코드</label>
        <input
          type="text"
          value={form.code}
          onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
          placeholder="gyeongchal-dongseong"
          className="w-full rounded-[16px] border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ember"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">지점명</label>
        <input
          type="text"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="academy-ops 강남 캠퍼스"
          className="w-full rounded-[16px] border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ember"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">지점 유형</label>
        <select
          value={form.type}
          onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AcademyType }))}
          className="w-full rounded-[16px] border border-ink/15 px-4 py-3 text-sm outline-none focus:border-ember"
        >
          {Object.entries(ACADEMY_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
