"use client";

import { useState } from "react";
import { useFilterPresets } from "@/hooks/use-filter-presets";

const MAX_PRESETS = 5;

type AbsenceNoteFilterPresetControlsProps = {
  formId: string;
  storageKey: string;
  fieldNames: string[];
  anchor?: string;
};

function getForm(formId: string) {
  return document.getElementById(formId) as HTMLFormElement | null;
}

function readFilters(form: HTMLFormElement, fieldNames: string[]) {
  const formData = new FormData(form);
  const nextFilters: Record<string, string> = {};

  for (const fieldName of fieldNames) {
    nextFilters[fieldName] = String(formData.get(fieldName) ?? "");
  }

  return nextFilters;
}

function writeFilters(form: HTMLFormElement, filters: Record<string, string>, fieldNames: string[]) {
  for (const fieldName of fieldNames) {
    const element = form.elements.namedItem(fieldName);
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement)) {
      continue;
    }

    element.value = filters[fieldName] ?? "";
  }
}

function navigateWithFilters(filters: Record<string, string>, anchor?: string) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }

    params.set(key, normalized);
  }

  const query = params.toString();
  const hash = anchor ? `#${anchor}` : "";
  window.location.assign(`${window.location.pathname}${query ? `?${query}` : ""}${hash}`);
}

export function AbsenceNoteFilterPresetControls({
  formId,
  storageKey,
  fieldNames,
  anchor,
}: AbsenceNoteFilterPresetControlsProps) {
  const { presets, savePreset, deletePreset } = useFilterPresets(storageKey);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [showSaveBox, setShowSaveBox] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");

  function handleSavePreset() {
    const name = presetNameInput.trim();
    if (!name) return;

    const form = getForm(formId);
    if (!form) return;

    const preset = savePreset(name, readFilters(form, fieldNames));
    if (!preset) return;

    setSelectedPresetId(preset.id);
    setPresetNameInput("");
    setShowSaveBox(false);
  }

  function handleApplyPreset(presetId: string) {
    setSelectedPresetId(presetId);

    if (!presetId) {
      return;
    }

    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    const form = getForm(formId);
    if (form) {
      writeFilters(form, preset.filters, fieldNames);
    }

    navigateWithFilters(preset.filters, anchor);
  }

  function handleDeletePreset() {
    if (!selectedPresetId) {
      return;
    }

    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      return;
    }

    const confirmed = window.confirm(`"${preset.name}" 프리셋을 삭제할까요?`);
    if (!confirmed) {
      return;
    }

    deletePreset(selectedPresetId);
    setSelectedPresetId("");
  }

  const atLimit = presets.length >= MAX_PRESETS;

  return (
    <div className="mt-5 rounded-[20px] border border-ink/10 bg-white px-4 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-2 block text-sm font-medium text-ink">저장된 필터 프리셋</label>
          <select
            value={selectedPresetId}
            onChange={(event) => handleApplyPreset(event.target.value)}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">프리셋 선택...</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowSaveBox((current) => !current)}
          disabled={atLimit}
          className="inline-flex items-center justify-center rounded-full border border-ink/10 bg-white px-4 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
        >
          현재 필터 저장
        </button>
        <button
          type="button"
          onClick={handleDeletePreset}
          disabled={!selectedPresetId}
          className="inline-flex items-center justify-center rounded-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          프리셋 삭제
        </button>
      </div>

      {showSaveBox && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={presetNameInput}
            onChange={(event) => setPresetNameInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") handleSavePreset(); }}
            placeholder="프리셋 이름 입력"
            className="flex-1 rounded-2xl border border-ink/10 bg-mist px-4 py-2 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={!presetNameInput.trim()}
            className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-40"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => { setShowSaveBox(false); setPresetNameInput(""); }}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30"
          >
            취소
          </button>
        </div>
      )}

      {atLimit && (
        <p className="mt-2 text-xs text-amber-700">
          최대 {MAX_PRESETS}개까지 저장할 수 있습니다. 기존 프리셋을 먼저 삭제하세요.
        </p>
      )}

      <p className="mt-3 text-xs leading-6 text-slate">
        자주 쓰는 조회 조건을 저장해 두고, 목록에서 선택하면 즉시 적용됩니다. (최대 {MAX_PRESETS}개)
      </p>
    </div>
  );
}
