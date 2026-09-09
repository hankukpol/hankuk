"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BellRing, Clipboard, Copy, LoaderCircle, RefreshCcw, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/sonner";

import { Modal } from "@/components/ui/Modal";
import { DialogActions } from "@/components/ui/DialogActions";
import { WarningStageBadge } from "@/components/students/StudentBadges";
import {
  getWarningNoticeChannelLabel,
  WARNING_NOTICE_CHANNEL_OPTIONS,
  type WarningNoticeChannelValue,
} from "@/lib/warning-notice-meta";
import type { WarningStudentItem } from "@/lib/services/point.service";
import type { WarningNoticeItem } from "@/lib/services/warning-notice.service";

type WarningStage = "WARNING_1" | "WARNING_2" | "INTERVIEW" | "WITHDRAWAL";

type WarningStudentsManagerProps = {
  divisionSlug: string;
  initialStudents: WarningStudentItem[];
  initialNotices: WarningNoticeItem[];
  divisionName: string;
  warningTemplates: Record<WarningStage, string>;
  studentManagementEnabled: boolean;
  interviewManagementEnabled: boolean;
  aggregationLabel: string;
  aggregationDescription: string;
};

const stageOptions = [
  { value: "ALL", label: "전체 단계" },
  { value: "WARNING_1", label: "1차 경고" },
  { value: "WARNING_2", label: "2차 경고" },
  { value: "INTERVIEW", label: "면담 대상" },
  { value: "WITHDRAWAL", label: "퇴실 대상" },
] as const;

function formatNoticeDate(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function WarningStudentsManager({
  divisionSlug,
  initialStudents,
  initialNotices,
  divisionName,
  warningTemplates,
  studentManagementEnabled,
  interviewManagementEnabled,
  aggregationLabel,
  aggregationDescription,
}: WarningStudentsManagerProps) {
  const [students, setStudents] = useState(initialStudents);
  const [notices, setNotices] = useState(initialNotices);
  const [stageFilter, setStageFilter] = useState<(typeof stageOptions)[number]["value"]>("ALL");
  // 이미 안내한 학생이 목록 위쪽을 차지하면 남은 일이 보이지 않는다.
  const [hideNotified, setHideNotified] = useState(true);
  const [noticeTarget, setNoticeTarget] = useState<WarningStudentItem | null>(null);
  const [noticeChannel, setNoticeChannel] = useState<WarningNoticeChannelValue>("SMS");
  const [noticeMemo, setNoticeMemo] = useState("");
  const [isSavingNotice, setIsSavingNotice] = useState(false);

  useEffect(() => {
    setStudents(initialStudents);
  }, [initialStudents]);

  useEffect(() => {
    setNotices(initialNotices);
  }, [initialNotices]);

  /** 학생·단계별 최신 안내 한 건. 목록은 최신순이라 처음 만난 항목이 최신이다. */
  const latestNoticeByKey = useMemo(() => {
    const latest = new Map<string, WarningNoticeItem>();

    for (const notice of [...notices].sort((left, right) =>
      right.noticedAt.localeCompare(left.noticedAt),
    )) {
      const key = `${notice.studentId}:${notice.stage}`;
      if (!latest.has(key)) {
        latest.set(key, notice);
      }
    }

    return latest;
  }, [notices]);

  function getCurrentStageNotice(student: WarningStudentItem) {
    return latestNoticeByKey.get(`${student.id}:${student.warningStage}`) ?? null;
  }

  const stageFilteredStudents = useMemo(
    () =>
      students.filter((student) => stageFilter === "ALL" || student.warningStage === stageFilter),
    [stageFilter, students],
  );

  const notifiedCount = useMemo(
    () => stageFilteredStudents.filter((student) => getCurrentStageNotice(student)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stageFilteredStudents, latestNoticeByKey],
  );

  const filteredStudents = useMemo(
    () =>
      hideNotified
        ? stageFilteredStudents.filter((student) => !getCurrentStageNotice(student))
        : stageFilteredStudents,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hideNotified, stageFilteredStudents, latestNoticeByKey],
  );

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("클립보드 복사에 실패했습니다.");
    }
  }

  async function refreshStudents() {
    const [studentsResponse, noticesResponse] = await Promise.all([
      fetch(`/api/${divisionSlug}/warnings`, { cache: "no-store" }),
      fetch(`/api/${divisionSlug}/warnings/notices`, { cache: "no-store" }),
    ]);
    const [studentsData, noticesData] = await Promise.all([
      studentsResponse.json(),
      noticesResponse.json(),
    ]);

    if (!studentsResponse.ok) {
      throw new Error(studentsData.error ?? "경고 대상자 목록을 불러오지 못했습니다.");
    }

    if (!noticesResponse.ok) {
      throw new Error(noticesData.error ?? "경고 안내 이력을 불러오지 못했습니다.");
    }

    setStudents(studentsData.students);
    setNotices(noticesData.notices);
  }

  function buildWarningMessage(student: WarningStudentItem) {
    const template =
      student.warningStage === "NORMAL"
        ? warningTemplates.WARNING_1
        : warningTemplates[student.warningStage as WarningStage];
    return template
      .replaceAll("{학원명}", divisionName)
      .replaceAll("{직렬명}", student.studyTrack || "미지정")
      .replaceAll("{학생이름}", student.name)
      .replaceAll("{벌점}", String(student.netPoints))
      .replaceAll("{경고단계}", student.warningStageLabel);
  }

  function openNoticeModal(student: WarningStudentItem) {
    setNoticeTarget(student);
    setNoticeChannel("SMS");
    setNoticeMemo("");
  }

  async function submitNotice() {
    if (!noticeTarget) {
      return;
    }

    setIsSavingNotice(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/warnings/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: noticeTarget.id,
          stage: noticeTarget.warningStage,
          channel: noticeChannel,
          noticeBody: buildWarningMessage(noticeTarget),
          memo: noticeMemo || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "경고 안내 기록에 실패했습니다.");
      }

      toast.success(`${noticeTarget.name} ${noticeTarget.warningStageLabel} 안내를 기록했습니다.`);
      setNoticeTarget(null);
      await refreshStudents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "경고 안내 기록에 실패했습니다.");
    } finally {
      setIsSavingNotice(false);
    }
  }

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="admin-section-title">경고 대상자 현황</h2>
            <p className="admin-help mt-2 leading-6">
              집계 기준: <strong className="text-admin-text">{aggregationLabel}</strong> · {aggregationDescription}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await refreshStudents();
                  toast.success("경고 대상자 목록을 새로고침했습니다.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "경고 대상자 목록을 불러오지 못했습니다.");
                }
              }}
              className="admin-button"
            >
              <RefreshCcw className="h-4 w-4" />
              새로고침
            </button>

            <button
              type="button"
              onClick={() =>
                copyText(
                  filteredStudents
                    .map((student) => `${student.name}\t${student.phone || ""}`)
                    .join("\n"),
                  "연락처 전체를 복사했습니다.",
                )
              }
              className="admin-button admin-button-primary"
            >
              <Clipboard className="h-4 w-4" />
              전체 연락처 복사
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as (typeof stageOptions)[number]["value"])}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
          >
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hideNotified}
              onChange={(event) => setHideNotified(event.target.checked)}
            />
            현재 단계 안내 완료 숨기기
          </label>

          <span className="admin-notice">
            {filteredStudents.length}명 표시
            {notifiedCount > 0 ? ` · 안내 완료 ${notifiedCount}명` : ""}
          </span>
        </div>

        {filteredStudents.length > 0 ? (
          <div className="admin-table-frame mt-5 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="text-left text-slate-500">
                  <th>단계</th>
                  <th>이름</th>
                  <th>수험번호</th>
                  <th>벌점</th>
                  <th>전화번호</th>
                  <th>안내 상태</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const notice = getCurrentStageNotice(student);

                  return (
                    <tr key={student.id}>
                      <td>
                        <WarningStageBadge stage={student.warningStage} label={student.warningStageLabel} />
                      </td>
                      <td>{student.name}</td>
                      <td>{student.studentNumber}</td>
                      <td>{student.netPoints}점</td>
                      <td>{student.phone || "미등록"}</td>
                      <td>
                        {notice ? (
                          <span className="text-sm text-slate-700">
                            {student.warningStageLabel} 안내 완료 {formatNoticeDate(notice.noticedAt)}
                            <span className="admin-help ml-1">
                              ({getWarningNoticeChannelLabel(notice.channel)} · {notice.noticedByName})
                            </span>
                          </span>
                        ) : (
                          <span className="admin-help">미안내</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => copyText(student.phone || "", `${student.name} 연락처를 복사했습니다.`)}
                            className="admin-button admin-button-compact"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            복사
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(buildWarningMessage(student), `${student.name} 문자 초안을 복사했습니다.`)
                            }
                            className="admin-button admin-button-compact"
                          >
                            <Clipboard className="h-3.5 w-3.5" />
                            문자 초안 복사
                          </button>
                          <button
                            type="button"
                            onClick={() => openNoticeModal(student)}
                            className="admin-button admin-button-compact"
                          >
                            <BellRing className="h-3.5 w-3.5" />
                            안내 완료
                          </button>
                          {interviewManagementEnabled ? (
                            <Link
                              href={{
                                pathname: `/${divisionSlug}/admin/interviews`,
                                query: {
                                  studentId: student.id,
                                  trigger: `벌점 ${student.netPoints}점 도달`,
                                  reason: `${student.warningStageLabel} 기준 도달`,
                                },
                              }}
                              className="admin-button admin-button-compact"
                            >
                              면담 기록
                            </Link>
                          ) : null}
                          {studentManagementEnabled ? (
                            <Link
                              href={`/${divisionSlug}/admin/students/${student.id}`}
                              className="admin-button admin-button-primary"
                            >
                              학생 보기
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-help mt-5 px-5 py-8 text-center">
            <TriangleAlert className="mx-auto h-5 w-5 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {notifiedCount > 0 && hideNotified
                ? "남은 대상자가 없습니다. 안내 완료 학생을 보려면 필터를 해제하세요."
                : "조건에 맞는 경고 대상자가 없습니다."}
            </p>
          </div>
        )}
      </section>

      <Modal
        open={Boolean(noticeTarget)}
        onClose={() => setNoticeTarget(null)}
        badge="경고 안내"
        title="안내 완료 기록"
        description="실제로 안내한 뒤에 기록합니다. 당시 점수와 기준이 함께 저장되어 나중에 기준이 바뀌어도 남습니다."
        widthClassName="max-w-lg"
        footer={
          <DialogActions>
            <button
              type="button"
              onClick={() => setNoticeTarget(null)}
              disabled={isSavingNotice}
              className="admin-button"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void submitNotice()}
              disabled={isSavingNotice}
              className="admin-button admin-button-primary"
            >
              {isSavingNotice ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              안내 완료로 기록
            </button>
          </DialogActions>
        }
      >
        {noticeTarget ? (
          <div className="space-y-5">
            <div className="admin-notice">
              <p className="font-semibold text-slate-900">
                {noticeTarget.name}
                <span className="admin-help ml-2">{noticeTarget.studentNumber}</span>
              </p>
              <p className="mt-1">
                {noticeTarget.warningStageLabel} · 현재 벌점 {noticeTarget.netPoints}점 ({aggregationLabel})
              </p>
            </div>

            <label className="block">
              <span className="admin-label mb-2 block">안내 방법</span>
              <select
                value={noticeChannel}
                onChange={(event) =>
                  setNoticeChannel(event.target.value as WarningNoticeChannelValue)
                }
                className="w-full"
              >
                {WARNING_NOTICE_CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="admin-label mb-2 block">메모 (선택)</span>
              <textarea
                value={noticeMemo}
                onChange={(event) => setNoticeMemo(event.target.value)}
                className="min-h-[90px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                placeholder="예: 보호자 부재로 학생 본인에게만 전달"
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
