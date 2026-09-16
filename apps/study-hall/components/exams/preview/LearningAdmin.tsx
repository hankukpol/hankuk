"use client";
import { useState, useId, type FormEvent } from "react";
import Link from "next/link";
import { DialogActions } from "@/components/ui/DialogActions";
import { AdminTabs } from "@/components/ui/AdminTabs";
import { SlideOver } from "@/components/ui/SlideOver";
import { useLearning } from "./LearningProvider";
import { LearningTable } from "./LearningTable";
import { seoulDay } from "@/lib/exam-preview/learning-analytics";
import {
  policyAt,
  learningCommandSchema,
  type LearningCommand,
  type LearningPolicy,
} from "@/lib/exam-preview/learning-types";
import styles from "./preview.module.css";
import {
  learningChangeRows,
  learningPolicyLabels as policyLabels,
} from "@/lib/exam-preview/learning-preview";

const suggested: LearningPolicy = {
  minItems: 10,
  minSessions: 2,
  weakGap: 10,
  lowCorrectRate: 70,
  repeatWrongSessions: 2,
  timeTracking: false,
  timeLimits: {},
};
export function LearningAdmin({ division, previewOnly = true }: { division: string; previewOnly?: boolean }) {
  const formId = useId();
  const learning = useLearning(),
    [tab, setTab] = useState("topics"),
    [editing, setEditing] = useState<LearningCommand | null>(null),
    [pending, setPending] = useState<LearningCommand | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [typeId, setTypeId] = useState(""),
    [sessionId, setSessionId] = useState(""),
    [subjectId, setSubjectId] = useState(""),
    [topicId, setTopicId] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  if (!learning?.data)
    return (
      <p className="admin-empty-state">학습 분석 설정을 불러오는 중입니다.</p>
    );
  const { document: doc, examTypes, sessions, mappingItems } = learning.data;
  const type = examTypes.find((t) => t.id === typeId) ?? examTypes[0],
    session =
      sessions
        .filter((s) => s.examTypeId === type?.id)
        .find((s) => s.id === sessionId) ??
      sessions.filter((s) => s.examTypeId === type?.id).at(-1),
    subject =
      type?.subjects.find((s) => s.id === subjectId) ?? type?.subjects[0];
  const group = doc.subjects.find((s) => s.subjectIds.includes(subject?.id)),
    choices = doc.topics.filter(
      (t) => t.parentId && t.active && t.subjectGroupId === group?.id,
    );
  const items = mappingItems
      .filter((i) => i.sessionId === session?.id && i.subjectId === subject?.id)
      .sort((a, b) => a.itemNo - b.itemNo),
    chosen = selected.filter((id) => items.some((i) => i.id === id));
  const chosenSet = new Set(chosen),
    editingSubjectSet = new Set(
      editing?.action === "subject" ? editing.subjectIds : [],
    );
  const open = (command: LearningCommand) => {
    setEditing(command);
    setError("");
  };
  const preview = (command: LearningCommand) => {
    const parsed = learningCommandSchema.safeParse(command);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" / "));
      return;
    }
    setPending(parsed.data);
    setEditing(null);
    setError("");
  };
  const currentPolicy = policyAt(doc, seoulDay(new Date().toISOString()));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (editing) preview(editing);
  };
  return (
    <div className={`admin-flat-page ${styles.reportTables}`}>
      <div className="admin-workspace-toolbar">
        <div>
          <h1 className="admin-page-title">진도·학습 분석 설정</h1>
          <p className="admin-help">
            이 학원의 표준 과목과 진도만 연결합니다. 변경 전 미리보기를
            확인하며, 기존 점수와 답안은 유지됩니다.
          </p>
        </div>
        <Link
          className="admin-button admin-button-secondary"
          href={`/${division}/admin/exams/${previewOnly?'preview':'analysis'}`}
        >
          성적 분석으로
        </Link>
      </div>
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="admin-notice admin-notice-danger">
          {error}
        </p>
      )}
      <AdminTabs
        variant="secondary"
        className={styles.mainTabs}
        idPrefix="learning-settings"
        panelId="learning-settings-panel"
        label="학습 분석 설정"
        items={[
          { id: "topics", label: "과목·진도" },
          { id: "mapping", label: "문항 연결" },
          { id: "schedule", label: "시험 예정" },
          { id: "policy", label: "분석 기준" },
          { id: "history", label: "변경 이력" },
        ]}
        activeId={tab}
        onChange={setTab}
      />
      <section
        id="learning-settings-panel"
        role="tabpanel"
        aria-labelledby={`learning-settings-${tab}`}
        className="admin-flat-page"
      >
        {tab === "topics" && (
          <>
            <div className="admin-workspace-toolbar">
              <h2 className="admin-section-title">1. 같은 과목 연결</h2>
              <button
                className="admin-button admin-button-primary"
                onClick={() =>
                  open({ action: "subject", name: "", subjectIds: [] })
                }
              >
                표준 과목 추가
              </button>
            </div>
            <p className="admin-help">
              예: 아침 헌법과 정기 헌법을 같은 표준 과목에 연결합니다. 과목
              이름만 같다고 자동 연결하지 않습니다.
            </p>
            <LearningTable
              label="표준 과목"
              heads={["표준 과목", "연결한 시험 과목", "수정"]}
              rows={doc.subjects.map((s) => [
                s.name,
                examTypes
                  .flatMap((t) =>
                    t.subjects
                      .filter((x) => s.subjectIds.includes(x.id))
                      .map((x) => `${t.name} / ${x.name}`),
                  )
                  .join(", "),
                <button
                  key="edit"
                  className="admin-table-link"
                  onClick={() => open({ action: "subject", ...s })}
                >
                  수정
                </button>,
              ])}
            />
            <div className="admin-workspace-toolbar">
              <h2 className="admin-section-title">2. 대단원과 세부 진도</h2>
              <button
                className="admin-button admin-button-secondary"
                disabled={!doc.subjects.length}
                onClick={() =>
                  open({
                    action: "topic",
                    subjectGroupId: doc.subjects[0]?.id ?? "",
                    parentId: null,
                    code: "",
                    name: "",
                    active: true,
                  })
                }
              >
                진도 추가
              </button>
            </div>
            <LearningTable
              label="표준 진도 목록"
              heads={["과목", "대단원", "세부 진도", "코드", "사용", "수정"]}
              rows={doc.topics.map((t) => [
                doc.subjects.find((s) => s.id === t.subjectGroupId)?.name,
                t.parentId
                  ? doc.topics.find((p) => p.id === t.parentId)?.name
                  : t.name,
                t.parentId ? t.name : "-",
                t.code,
                t.active ? "사용" : "비활성",
                <button
                  key="edit"
                  className="admin-table-link"
                  onClick={() => open({ action: "topic", ...t })}
                >
                  수정
                </button>,
              ])}
            />
          </>
        )}
        {tab === "mapping" && (
          <>
            <h2 className="admin-section-title">
              3. 문항별 세부 진도 일괄 연결
            </h2>
            <div className="admin-filter-bar">
              <label className="admin-label">
                시험 종류
                <select
                  value={type?.id ?? ""}
                  onChange={(e) => {
                    setTypeId(e.target.value);
                    setSessionId("");
                    setSubjectId("");
                    setSelected([]);
                    setTopicId("");
                  }}
                >
                  {examTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-label">
                시험일
                <select
                  value={session?.id ?? ""}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                    setSelected([]);
                  }}
                >
                  {sessions
                    .filter((s) => s.examTypeId === type?.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.date}
                      </option>
                    ))}
                </select>
              </label>
              <label className="admin-label">
                문항 과목
                <select
                  value={subject?.id ?? ""}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setSelected([]);
                    setTopicId("");
                  }}
                >
                  {type?.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-label">
                연결할 세부 진도
                <select
                  aria-label="연결할 세부 진도"
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                >
                  <option value="">선택</option>
                  {choices.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="admin-button admin-button-secondary"
                onClick={() =>
                  setSelected(
                    chosen.length === items.length
                      ? []
                      : items.map((i) => i.id),
                  )
                }
              >
                {chosen.length === items.length
                  ? "선택 해제"
                  : "모든 문항 선택"}
              </button>
              <button
                className="admin-button admin-button-primary"
                disabled={
                  !chosen.length || !choices.some((t) => t.id === topicId)
                }
                onClick={() =>
                  preview({ action: "assign", topicId, itemIds: chosen })
                }
              >
                선택 {chosen.length}문항 연결 미리보기
              </button>
              <button
                className="admin-button admin-button-secondary"
                disabled={!chosen.length}
                onClick={() =>
                  preview({ action: "assign", topicId: null, itemIds: chosen })
                }
              >
                연결 해제 미리보기
              </button>
            </div>
            <LearningTable
              label="문항 진도 연결"
              heads={["문항 번호", "배점", "현재 세부 진도", "선택"]}
              rows={items.map((i) => [
                `${i.itemNo}번`,
                `${i.points}점`,
                doc.topics.find((t) => t.id === doc.assignments[i.id])?.name ??
                  "미연결",
                <input
                  key="select"
                  type="checkbox"
                  aria-label={`${i.itemNo}번 진도 연결 선택`}
                  checked={chosenSet.has(i.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? chosen.concat(i.id)
                        : chosen.filter((id) => id !== i.id),
                    )
                  }
                />,
              ])}
            />
          </>
        )}
        {tab === "schedule" && (
          <>
            <div className="admin-workspace-toolbar">
              <h2 className="admin-section-title">진도별 시험 예정</h2>
              <button
                className="admin-button admin-button-primary"
                disabled={!doc.topics.some((t) => t.parentId)}
                onClick={() =>
                  open({
                    action: "schedule",
                    date: seoulDay(new Date().toISOString()),
                    examTypeId: examTypes[0]?.id ?? "",
                    topicId: "",
                  })
                }
              >
                시험 예정 추가
              </button>
            </div>
            <p className="admin-help">
              예정일 전에는 학습 예정, 예정일 이후 채점 기록이 없으면
              미응시·자료 없음으로 표시합니다. 미응시 벌점과 연결되지 않습니다.
            </p>
            <LearningTable
              label="진도별 시험 일정"
              heads={["예정일", "시험 종류", "진도"]}
              rows={doc.plans
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((p) => [
                  p.date,
                  examTypes.find((t) => t.id === p.examTypeId)?.name,
                  doc.topics.find((t) => t.id === p.topicId)?.name,
                ])}
            />
          </>
        )}
        {tab === "policy" && (
          <>
            <div className="admin-workspace-toolbar">
              <h2 className="admin-section-title">학원별 분석 기준</h2>
              <button
                className="admin-button admin-button-primary"
                onClick={() =>
                  open({
                    action: "policy",
                    effectiveFrom: seoulDay(new Date().toISOString()),
                    value: structuredClone(currentPolicy ?? suggested),
                  })
                }
              >
                기준 변경 미리보기
              </button>
            </div>
            <p className="admin-help">
              미설정 학원에는 취약 판정이나 시간 기록을 자동 활성화하지
              않습니다. 아래 값은 현재 적용된 기준이며 새 적용일의 설정을 따로
              저장할 수 있습니다.
            </p>
            <LearningTable
              label="현재 분석 기준"
              heads={["기준", "설정값"]}
              rows={
                currentPolicy
                  ? [
                      ...Object.entries(policyLabels).map(([key, label]) => [
                        label,
                        String(currentPolicy[key as keyof LearningPolicy]),
                      ]),
                      [
                        "풀이시간 기록",
                        currentPolicy.timeTracking ? "사용" : "사용 안 함",
                      ],
                      ...Object.entries(currentPolicy.timeLimits).map(
                        ([id, min]) => [
                          `${examTypes.find((t) => t.id === id)?.name} 제한 시간`,
                          `${min}분`,
                        ],
                      ),
                    ]
                  : []
              }
            />
            <LearningTable
              label="분석 기준 적용 이력"
              heads={[
                "적용일",
                "최소 문항",
                "최소 회차",
                "복습 차이",
                "시간 기록",
              ]}
              rows={doc.policies
                .slice()
                .reverse()
                .map((p) => [
                  p.effectiveFrom,
                  p.value.minItems,
                  p.value.minSessions,
                  `${p.value.weakGap}%p`,
                  p.value.timeTracking ? "사용" : "사용 안 함",
                ])}
            />
          </>
        )}
        {tab === "history" && (
          <>
            <h2 className="admin-section-title">변경 이력</h2>
            <LearningTable
              label="학습 설정 변경 이력"
              heads={["변경일", "변경 종류", "이전 / 이후"]}
              rows={doc.audit
                .slice()
                .reverse()
                .map((a) => [
                  new Date(a.at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  }),
                  (
                    {
                      subject: "표준 과목",
                      topic: "진도",
                      assign: "문항 연결",
                      schedule: "시험 예정",
                      policy: "분석 기준",
                      plan: "복습 예약",
                      attempt: "재풀이",
                      time: "시간 기록",
                    } as Record<string, string>
                  )[a.action],
                  <details key="history">
                    <summary>변경 내용 보기</summary>
                    <pre className={styles.auditJson}>
                      {JSON.stringify(
                        { 이전: a.before, 이후: a.after },
                        null,
                        2,
                      )}
                    </pre>
                  </details>,
                ])}
            />
          </>
        )}
      </section>
      <SlideOver
        open={Boolean(editing)}
        title="학습 분석 설정 입력"
        onClose={() => setEditing(null)}
      >
        <form id={formId} onSubmit={submit} className="space-y-4">
          {editing?.action === "subject" && (
            <>
              <label className="admin-label block">
                표준 과목명
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="admin-section-title">
                  연결할 시험 과목
                </legend>
                {examTypes.flatMap((t) =>
                  t.subjects.map((s) => (
                    <label key={s.id} className="admin-label flex gap-2">
                      <input
                        type="checkbox"
                        checked={editingSubjectSet.has(s.id)}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            subjectIds: e.target.checked
                              ? editing.subjectIds.concat(s.id)
                              : editing.subjectIds.filter((id) => id !== s.id),
                          })
                        }
                      />
                      {t.name} / {s.name}
                    </label>
                  )),
                )}
              </fieldset>
            </>
          )}
          {editing?.action === "topic" && (
            <>
              <label className="admin-label block">
                표준 과목
                <select
                  disabled={Boolean(editing.id)}
                  value={editing.subjectGroupId}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      subjectGroupId: e.target.value,
                      parentId: null,
                    })
                  }
                >
                  {doc.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-label block">
                상위 대단원
                <select
                  disabled={Boolean(editing.id)}
                  value={editing.parentId ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, parentId: e.target.value || null })
                  }
                >
                  <option value="">없음 · 대단원으로 등록</option>
                  {doc.topics
                    .filter(
                      (t) =>
                        !t.parentId &&
                        t.active &&
                        t.subjectGroupId === editing.subjectGroupId,
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="admin-label block">
                진도 코드
                <input
                  required
                  value={editing.code}
                  onChange={(e) =>
                    setEditing({ ...editing, code: e.target.value })
                  }
                />
              </label>
              <label className="admin-label block">
                진도명
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label className="admin-label flex gap-2">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) =>
                    setEditing({ ...editing, active: e.target.checked })
                  }
                />
                사용
              </label>
            </>
          )}
          {editing?.action === "schedule" && (
            <>
              <label className="admin-label block">
                시험 예정일
                <input
                  type="date"
                  required
                  value={editing.date}
                  onChange={(e) =>
                    setEditing({ ...editing, date: e.target.value })
                  }
                />
              </label>
              <label className="admin-label block">
                시험 종류
                <select
                  value={editing.examTypeId}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      examTypeId: e.target.value,
                      topicId: "",
                    })
                  }
                >
                  {examTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-label block">
                세부 진도
                <select
                  required
                  value={editing.topicId}
                  onChange={(e) =>
                    setEditing({ ...editing, topicId: e.target.value })
                  }
                >
                  <option value="">선택</option>
                  {doc.topics
                    .filter(
                      (t) =>
                        t.parentId &&
                        t.active &&
                        doc.subjects
                          .find((s) => s.id === t.subjectGroupId)
                          ?.subjectIds.some((id) =>
                            examTypes
                              .find((e) => e.id === editing.examTypeId)
                              ?.subjects.some((s) => s.id === id),
                          ),
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {
                          doc.subjects.find((s) => s.id === t.subjectGroupId)
                            ?.name
                        }{" "}
                        / {t.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {editing?.action === "policy" && (
            <>
              <label className="admin-label block">
                적용 시작일
                <input
                  required
                  type="date"
                  value={editing.effectiveFrom}
                  onChange={(e) =>
                    setEditing({ ...editing, effectiveFrom: e.target.value })
                  }
                />
              </label>
              {!currentPolicy && (
                <p className="admin-help">
                  초기 입력값은 검토용 제안입니다. 저장하기 전까지 활성화되지
                  않습니다.
                </p>
              )}
              {Object.entries(policyLabels).map(([key, label]) => (
                <label key={key} className="admin-label block">
                  {label}
                  <input
                    required
                    type="number"
                    min={
                      key === "repeatWrongSessions"
                        ? 2
                        : key.includes("Rate") || key === "weakGap"
                          ? 0
                          : 1
                    }
                    max={
                      key === "minItems"
                        ? 500
                        : key.includes("Sessions")
                          ? 30
                          : 100
                    }
                    value={
                      Number.isFinite(
                        editing.value[key as keyof LearningPolicy],
                      )
                        ? (editing.value[key as keyof LearningPolicy] as number)
                        : ""
                    }
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        value: {
                          ...editing.value,
                          [key]: e.target.valueAsNumber,
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label className="admin-label flex gap-2">
                <input
                  type="checkbox"
                  checked={editing.value.timeTracking}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      value: {
                        ...editing.value,
                        timeTracking: e.target.checked,
                      },
                    })
                  }
                />
                풀이시간 기록 사용
              </label>
              {examTypes.map((t) => (
                <label className="admin-label block" key={t.id}>
                  {t.name} 제한 시간 (분, 선택)
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={editing.value.timeLimits[t.id] ?? ""}
                    onChange={(e) => {
                      const next = { ...editing.value.timeLimits };
                      if (e.target.value) next[t.id] = e.target.valueAsNumber;
                      else delete next[t.id];
                      setEditing({
                        ...editing,
                        value: { ...editing.value, timeLimits: next },
                      });
                    }}
                  />
                </label>
              ))}
            </>
          )}
          <DialogActions>
            <button
              className="admin-button admin-button-primary"
              form={formId}
              type="submit"
            >
              변경 내용 미리보기
            </button>
          </DialogActions>
          {error && <p role="alert">{error}</p>}
        </form>
      </SlideOver>
      <SlideOver
        open={Boolean(pending)}
        title="변경 전 확인"
        onClose={() => setPending(null)}
      >
        <div className="space-y-4">
          <LearningTable
            label="설정 변경 미리보기"
            heads={["항목", "변경 전", "변경 후"]}
            rows={pending ? learningChangeRows(learning.data, pending) : []}
          />
          <p className="admin-help">
            현재 학원에만 적용하며 변경 이력을 남깁니다. 기존 시험 점수와 원본
            답안은 수정하지 않습니다.
          </p>
          <DialogActions>
            <button
              className="admin-button admin-button-primary"
              disabled={learning.busy}
              onClick={async () => {
                if (pending && (await learning.save(pending))) {
                  setNotice("변경 내용을 저장했습니다.");
                  setPending(null);
                  setSelected([]);
                }
              }}
            >
              확인한 내용 저장
            </button>
          </DialogActions>
          {learning.error && <p role="alert">{learning.error}</p>}
        </div>
      </SlideOver>
    </div>
  );
}
