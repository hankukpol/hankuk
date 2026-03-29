"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { toDateInputValue } from "@/lib/format";

export type CounselingRecordDetail = {
  id: number;
  examNumber: string;
  counselorName: string;
  content: string;
  recommendation: string | null;
  counseledAt: string; // ISO string
  nextSchedule: string | null; // ISO string or null
};

type Props = {
  record: CounselingRecordDetail;
};

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      (payload.error as string | undefined) ?? "요청에 실패했습니다.",
    );
  }
  return payload;
}

export function CounselingActions({ record: initialRecord }: Props) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [record, setRecord] = useState(initialRecord);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  function handleSave() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);

    startTransition(async () => {
      try {
        const { record: updated } = await requestJson(
          `/api/counseling/${record.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              counselorName: String(formData.get("counselorName") ?? ""),
              content: String(formData.get("content") ?? ""),
              recommendation:
                String(formData.get("recommendation") ?? "") || null,
              counseledAt: String(formData.get("counseledAt") ?? ""),
              nextSchedule: String(formData.get("nextSchedule") ?? "") || null,
            }),
          },
        );

        const r = updated as CounselingRecordDetail;
        setRecord({
          ...r,
          counseledAt:
            typeof r.counseledAt === "string"
              ? r.counseledAt
              : new Date(r.counseledAt as unknown as string).toISOString(),
          nextSchedule: r.nextSchedule
            ? typeof r.nextSchedule === "string"
              ? r.nextSchedule
              : new Date(r.nextSchedule as unknown as string).toISOString()
            : null,
        });
        setIsEditing(false);
        toast.success("면담 기록을 수정했습니다.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "수정에 실패했습니다.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await requestJson(`/api/counseling/${record.id}`, {
          method: "DELETE",
        });
        router.push("/admin/counseling");
        router.refresh();
      } catch (error) {
        setShowDeleteConfirm(false);
        toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                {isPending && <Spinner />}
                저장
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                }}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
              }}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              수정
            </button>
          )}
        </div>

        {!isEditing ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            삭제
          </button>
        ) : null}
      </div>

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">
            이 면담 기록을 삭제하시겠습니까?
          </p>
          <p className="mt-1 text-sm text-red-700">
            삭제 후에는 되돌릴 수 없으며 통계에도 반영됩니다.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="inline-flex items-center rounded-full bg-red-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending && <Spinner />}
              삭제 확인
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {/* Detail / Edit Card */}
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
        {isEditing ? (
          <form ref={formRef} className="space-y-5 p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  담당 강사
                </label>
                <input
                  name="counselorName"
                  defaultValue={record.counselorName}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  면담 일자
                </label>
                <input
                  type="date"
                  name="counseledAt"
                  defaultValue={toDateInputValue(record.counseledAt)}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                />
              </div>
              <div className="xl:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  다음 면담 예정일
                </label>
                <input
                  type="date"
                  name="nextSchedule"
                  defaultValue={toDateInputValue(
                    record.nextSchedule ?? undefined,
                  )}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">
                면담 내용
              </label>
              <textarea
                name="content"
                rows={5}
                defaultValue={record.content}
                className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">
                추천 학습 방향
              </label>
              <textarea
                name="recommendation"
                rows={3}
                defaultValue={record.recommendation ?? ""}
                className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
              />
            </div>
          </form>
        ) : (
          <dl className="divide-y divide-ink/10">
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                담당 강사
              </dt>
              <dd className="text-sm text-ink">{record.counselorName}</dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                면담 일시
              </dt>
              <dd className="text-sm text-ink">
                {new Date(record.counseledAt).toLocaleString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                다음 면담 예정일
              </dt>
              <dd className="text-sm text-ink">
                {record.nextSchedule ? (
                  new Date(record.nextSchedule).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })
                ) : (
                  <span className="text-slate">미정</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
              <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                면담 내용
              </dt>
              <dd className="whitespace-pre-wrap text-sm leading-7 text-ink">
                {record.content}
              </dd>
            </div>
            {record.recommendation ? (
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">
                  추천 학습 방향
                </dt>
                <dd className="whitespace-pre-wrap text-sm leading-7 text-ink">
                  {record.recommendation}
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </div>
    </div>
  );
}
