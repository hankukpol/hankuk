"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import useConfirmModal from "@/hooks/useConfirmModal";
import { Button } from "@/components/ui/button";

interface ExamItem {
  id: number;
  name: string;
  year: number;
  round: number;
  isActive: boolean;
}

interface ReleaseItem {
  id: number;
  examId: number;
  releaseNumber: number;
  releasedAt: string;
  participantCount: number;
  memo: string | null;
  createdBy: {
    id: number;
    name: string;
  };
  snapshotCount: number;
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

async function readResponseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

export default function AdminPassCutPage() {
  const { enabled: passCutEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("passCut");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const { confirm, modalProps } = useConfirmModal();

  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [releases, setReleases] = useState<ReleaseItem[]>([]);

  const nextReleaseNumber = useMemo(() => {
    const used = new Set(releases.map((release) => release.releaseNumber));
    for (let n = 1; n <= 4; n += 1) {
      if (!used.has(n)) return n;
    }
    return null;
  }, [releases]);

  async function loadExams() {
    const response = await fetch("/api/admin/exam?feature=passCut", {
      method: "GET",
      cache: "no-store",
    });
    const data = await readResponseJson<{ exams?: ExamItem[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(data?.error ?? `시험 목록을 불러오지 못했습니다. (${response.status})`);
    }
    const nextExams = data?.exams ?? [];
    setExams(nextExams);
    setSelectedExamId((current) => {
      if (current && nextExams.some((exam) => exam.id === current)) return current;
      if (nextExams.length < 1) return null;
      const active = nextExams.find((exam) => exam.isActive) ?? nextExams[0];
      return active.id;
    });
  }

  async function loadReleases(examId: number) {
    const response = await fetch(`/api/admin/pass-cut-release?examId=${examId}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = await readResponseJson<{ releases?: ReleaseItem[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(data?.error ?? `합격컷 발표 이력을 불러오지 못했습니다. (${response.status})`);
    }
    setReleases(data?.releases ?? []);
  }

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!passCutEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    (async () => {
      setIsLoading(true);
      setNotice(null);
      try {
        await loadExams();
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "초기 데이터 로딩 중 오류가 발생했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isFeatureLoading, passCutEnabled]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!passCutEnabled || !selectedExamId) {
      setReleases([]);
      return;
    }
    (async () => {
      try {
        await loadReleases(selectedExamId);
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "발표 이력 조회에 실패했습니다.",
        });
      }
    })();
  }, [isFeatureLoading, passCutEnabled, selectedExamId]);

  async function handleRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!selectedExamId) {
      setNotice({ type: "error", message: "시험을 먼저 선택해 주세요." });
      return;
    }
    if (!nextReleaseNumber) {
      setNotice({ type: "error", message: "이미 1~4차 발표가 모두 등록되었습니다." });
      return;
    }

    const ok = await confirm({ title: "합격컷 발표", description: `${nextReleaseNumber}차 합격컷을 발표하시겠습니까?` });
    if (!ok) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/pass-cut-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId,
          releaseNumber: nextReleaseNumber,
          memo: memo.trim() || null,
          autoNotice: true,
        }),
      });
      const data = await readResponseJson<{
        success?: boolean;
        releaseNumber?: number;
        snapshotCount?: number;
        error?: string;
      }>(response);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? `합격컷 발표 처리에 실패했습니다. (${response.status})`);
      }

      setMemo("");
      setNotice({
        type: "success",
        message: `${data.releaseNumber}차 발표가 등록되었습니다. (스냅샷 ${data.snapshotCount ?? 0}건)`,
      });
      await loadReleases(selectedExamId);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "합격컷 발표 처리에 실패했습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isFeatureLoading || (passCutEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">관리 화면을 불러오는 중입니다...</p>;
  }

  if (!passCutEnabled) {
    return <AdminFeatureDisabledState feature="passCut" />;
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">합격컷 발표 관리 화면을 불러오는 중입니다...</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">합격컷 발표 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          1~4차 단계별 합격컷을 발표하고, 발표 시점의 지역별 스냅샷을 저장합니다.
        </p>
      </header>

      {notice ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            notice.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="exam-id">
            시험 선택
          </label>
          <select
            id="exam-id"
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm md:max-w-md"
            value={selectedExamId ?? ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSelectedExamId(Number.isInteger(next) ? next : null);
            }}
          >
            {exams.length < 1 ? <option value="">시험 없음</option> : null}
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.year}년 {exam.round}차 - {exam.name}
                {exam.isActive ? " (활성)" : ""}
              </option>
            ))}
          </select>
        </div>

        <form className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4" onSubmit={handleRelease}>
          <p className="text-sm font-semibold text-slate-800">
            다음 발표 차수:{" "}
            <span className="text-fire-700">
              {nextReleaseNumber ? `${nextReleaseNumber}차` : "완료"}
            </span>
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="release-memo">
              발표 메모
            </label>
            <textarea
              id="release-memo"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="예: 표본이 800명 이상 확보되어 3차 발표 진행"
            />
          </div>
          <Button type="submit" disabled={isSubmitting || !selectedExamId || nextReleaseNumber === null}>
            {isSubmitting
              ? "처리 중..."
              : nextReleaseNumber
                ? `${nextReleaseNumber}차 합격컷 발표하기`
                : "발표 완료"}
          </Button>
        </form>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">차수</th>
              <th className="px-4 py-3">발표일시</th>
              <th className="px-4 py-3">참여자</th>
              <th className="px-4 py-3">스냅샷</th>
              <th className="px-4 py-3">발표자</th>
              <th className="px-4 py-3">메모</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {releases.length < 1 ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={6}>
                  아직 등록된 발표 이력이 없습니다.
                </td>
              </tr>
            ) : (
              releases.map((release) => (
                <tr key={release.id} className="bg-white">
                  <td className="px-4 py-3 font-semibold text-slate-900">{release.releaseNumber}차</td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(release.releasedAt)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {release.participantCount.toLocaleString("ko-KR")}명
                  </td>
                  <td className="px-4 py-3 text-slate-700">{release.snapshotCount.toLocaleString("ko-KR")}건</td>
                  <td className="px-4 py-3 text-slate-700">{release.createdBy.name}</td>
                  <td className="px-4 py-3 text-slate-700">{release.memo ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
