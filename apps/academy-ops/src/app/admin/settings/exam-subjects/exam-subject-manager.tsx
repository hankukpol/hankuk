"use client";

import { ExamType, Subject } from "@prisma/client";
import { useMemo, useState, useTransition } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import { EXAM_TYPE_LABEL, EXAM_TYPE_SUBJECTS, SUBJECT_LABEL } from "@/lib/constants";

type ExamSubjectRow = {
  id: number;
  academyId: number;
  examType: ExamType;
  code: Subject;
  displayName: string;
  shortLabel: string;
  displayOrder: number;
  maxScore: number;
  isActive: boolean;
};

type Props = {
  academyLabel: string;
  initialRows: ExamSubjectRow[];
};

type FormState = {
  examType: ExamType;
  code: Subject;
  displayName: string;
  shortLabel: string;
  displayOrder: string;
  maxScore: string;
  isActive: boolean;
};

type EditorState =
  | { mode: "create"; examType: ExamType }
  | { mode: "edit"; rowId: number }
  | null;

function sortRows(rows: ExamSubjectRow[]) {
  return [...rows].sort((left, right) => {
    const examTypeRank =
      (left.examType === ExamType.GONGCHAE ? 0 : 1) - (right.examType === ExamType.GONGCHAE ? 0 : 1);
    return (
      examTypeRank ||
      left.displayOrder - right.displayOrder ||
      left.displayName.localeCompare(right.displayName, "ko-KR")
    );
  });
}

function buildCreateForm(examType: ExamType, code: Subject): FormState {
  return {
    examType,
    code,
    displayName: SUBJECT_LABEL[code] ?? code,
    shortLabel: (SUBJECT_LABEL[code] ?? code).slice(0, 2),
    displayOrder: "1",
    maxScore: "100",
    isActive: true,
  };
}

function buildEditForm(row: ExamSubjectRow): FormState {
  return {
    examType: row.examType,
    code: row.code,
    displayName: row.displayName,
    shortLabel: row.shortLabel,
    displayOrder: String(row.displayOrder),
    maxScore: String(row.maxScore),
    isActive: row.isActive,
  };
}

export function ExamSubjectManager({ academyLabel, initialRows }: Props) {
  const [rows, setRows] = useState(() => sortRows(initialRows));
  const [editor, setEditor] = useState<EditorState>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groupedRows = useMemo(
    () => ({
      [ExamType.GONGCHAE]: rows.filter((row) => row.examType === ExamType.GONGCHAE),
      [ExamType.GYEONGCHAE]: rows.filter((row) => row.examType === ExamType.GYEONGCHAE),
    }),
    [rows],
  );

  function availableCodes(examType: ExamType, rowId?: number) {
    const usedCodes = new Set(
      rows
        .filter((row) => row.examType === examType && row.id !== rowId)
        .map((row) => row.code),
    );

    return EXAM_TYPE_SUBJECTS[examType].filter((code) => !usedCodes.has(code));
  }

  function openCreate(examType: ExamType) {
    const codes = availableCodes(examType);
    if (codes.length === 0) {
      setErrorMessage("추가할 수 있는 남은 과목 코드가 없습니다.");
      return;
    }

    setNotice(null);
    setErrorMessage(null);
    setEditor({ mode: "create", examType });
    setForm(buildCreateForm(examType, codes[0]));
  }

  function openEdit(row: ExamSubjectRow) {
    setNotice(null);
    setErrorMessage(null);
    setEditor({ mode: "edit", rowId: row.id });
    setForm(buildEditForm(row));
  }

  function closeEditor() {
    setEditor(null);
    setForm(null);
  }

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function handleCodeChange(code: Subject) {
    updateForm({
      code,
      displayName: SUBJECT_LABEL[code] ?? code,
      shortLabel: (SUBJECT_LABEL[code] ?? code).slice(0, 2),
    });
  }

  function handleSubmit() {
    if (!form || !editor) {
      return;
    }

    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const payload = {
          examType: form.examType,
          code: form.code,
          displayName: form.displayName,
          shortLabel: form.shortLabel,
          displayOrder: Number(form.displayOrder),
          maxScore: Number(form.maxScore),
          isActive: form.isActive,
        };

        if (editor.mode === "create") {
          const response = await fetchJson<{ data: ExamSubjectRow }>("/api/settings/exam-subjects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          setRows((current) => sortRows([...current, response.data]));
          setNotice("시험 과목을 추가했습니다.");
          closeEditor();
          return;
        }

        const response = await fetchJson<{ data: ExamSubjectRow }>(
          `/api/settings/exam-subjects/${editor.rowId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              displayName: payload.displayName,
              shortLabel: payload.shortLabel,
              displayOrder: payload.displayOrder,
              maxScore: payload.maxScore,
              isActive: payload.isActive,
            }),
          },
        );

        setRows((current) =>
          sortRows(current.map((row) => (row.id === response.data.id ? response.data : row))),
        );
        setNotice("시험 과목을 수정했습니다.");
        closeEditor();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">운영 지점</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">{academyLabel}</h2>
          </div>
          <div className="text-sm text-slate">
            공통 코드 세트 위에서 지점별 표시명, 약어, 순서, 활성 여부를 관리합니다.
          </div>
        </div>
      </div>

      {editor && form ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                {editor.mode === "create" ? "과목 추가" : "과목 수정"}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink">
                {EXAM_TYPE_LABEL[form.examType]} · {editor.mode === "create" ? "새 과목" : form.displayName}
              </h3>
            </div>
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
            >
              닫기
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">직렬</label>
              <select
                value={form.examType}
                onChange={(event) => {
                  const nextExamType = event.target.value as ExamType;
                  const codes = availableCodes(
                    nextExamType,
                    editor.mode === "edit" ? editor.rowId : undefined,
                  );
                  updateForm({
                    examType: nextExamType,
                    code: codes.includes(form.code) ? form.code : codes[0] ?? form.code,
                  });
                }}
                disabled={editor.mode === "edit"}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              >
                {Object.values(ExamType).map((examType) => (
                  <option key={examType} value={examType}>
                    {EXAM_TYPE_LABEL[examType]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink">과목 코드</label>
              <select
                value={form.code}
                onChange={(event) => handleCodeChange(event.target.value as Subject)}
                disabled={editor.mode === "edit"}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              >
                {availableCodes(form.examType, editor.mode === "edit" ? editor.rowId : undefined)
                  .concat(editor.mode === "edit" ? [form.code] : [])
                  .filter((value, index, array) => array.indexOf(value) === index)
                  .map((code) => (
                    <option key={code} value={code}>
                      {code} · {SUBJECT_LABEL[code] ?? code}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink">과목명</label>
              <input
                value={form.displayName}
                onChange={(event) => updateForm({ displayName: event.target.value })}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink">약어</label>
              <input
                value={form.shortLabel}
                onChange={(event) => updateForm({ shortLabel: event.target.value })}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                maxLength={10}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink">표시 순서</label>
              <input
                type="number"
                min={1}
                max={99}
                value={form.displayOrder}
                onChange={(event) => updateForm({ displayOrder: event.target.value })}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink">만점 기준</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={form.maxScore}
                onChange={(event) => updateForm({ maxScore: event.target.value })}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => updateForm({ isActive: event.target.checked })}
            />
            활성 과목으로 사용
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              {isPending ? "저장 중..." : editor.mode === "create" ? "과목 추가" : "변경 저장"}
            </button>
            <button
              type="button"
              onClick={closeEditor}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {Object.values(ExamType).map((examType) => {
        const sectionRows = groupedRows[examType];
        return (
          <section key={examType} className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                  {EXAM_TYPE_LABEL[examType]}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-ink">{EXAM_TYPE_LABEL[examType]} 과목 목록</h3>
              </div>
              <button
                type="button"
                onClick={() => openCreate(examType)}
                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
              >
                과목 추가
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/60 text-left text-xs uppercase tracking-widest text-slate">
                  <tr>
                    <th className="px-4 py-3 font-medium">순서</th>
                    <th className="px-4 py-3 font-medium">과목 코드</th>
                    <th className="px-4 py-3 font-medium">과목명</th>
                    <th className="px-4 py-3 font-medium">약어</th>
                    <th className="px-4 py-3 font-medium">만점</th>
                    <th className="px-4 py-3 font-medium">상태</th>
                    <th className="px-4 py-3 text-right font-medium">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {sectionRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-semibold text-ink">{row.displayOrder}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate">{row.code}</td>
                      <td className="px-4 py-3 font-medium text-ink">{row.displayName}</td>
                      <td className="px-4 py-3 text-slate">{row.shortLabel}</td>
                      <td className="px-4 py-3 text-slate">{row.maxScore}점</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            row.isActive
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-ink/10 bg-mist text-slate"
                          }`}
                        >
                          {row.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex items-center rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/30"
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sectionRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate">
                        등록된 과목이 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

