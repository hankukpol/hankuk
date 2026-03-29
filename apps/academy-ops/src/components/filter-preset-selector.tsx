"use client";

import { useState } from "react";
import { useFilterPresets } from "@/hooks/use-filter-presets";
import { FILTER_PRESET_MAX } from "@/hooks/use-filter-presets";

type FilterPresetSelectorProps = {
  currentFilters: Record<string, string>;
  onLoad: (filters: Record<string, string>) => void;
  storageKey: string;
};

export function FilterPresetSelector({
  currentFilters,
  onLoad,
  storageKey,
}: FilterPresetSelectorProps) {
  const { presets, savePreset, loadPreset, deletePreset } = useFilterPresets(storageKey);
  const [selectedId, setSelectedId] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const atLimit = presets.length >= FILTER_PRESET_MAX;

  function handleSelect(id: string) {
    setSelectedId(id);
    if (!id) return;
    const filters = loadPreset(id);
    if (filters) {
      onLoad(filters);
    }
  }

  function handleSave() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const preset = savePreset(trimmed, currentFilters);
    if (preset) {
      setSelectedId(preset.id);
      setNameInput("");
      setShowSaveInput(false);
    }
  }

  function handleDelete() {
    if (!selectedId) return;
    const preset = presets.find((p) => p.id === selectedId);
    if (!preset) return;
    const confirmed = window.confirm(`"${preset.name}" 프리셋을 삭제할까요?`);
    if (!confirmed) return;
    deletePreset(selectedId);
    setSelectedId("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/* Preset selector dropdown */}
      <div className="min-w-[200px]">
        <select
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm"
        >
          <option value="">저장된 필터 선택...</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      {/* Save current filters button */}
      <button
        type="button"
        onClick={() => setShowSaveInput((v) => !v)}
        disabled={atLimit}
        className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
      >
        현재 필터 저장
      </button>

      {/* Delete selected preset */}
      {selectedId && (
        <button
          type="button"
          onClick={handleDelete}
          className="inline-flex items-center rounded-full border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
        >
          삭제
        </button>
      )}

      {/* Save input box */}
      {showSaveInput && (
        <div className="mt-2 flex w-full items-center gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="프리셋 이름 입력"
            className="flex-1 rounded-2xl border border-ink/10 bg-mist px-4 py-2 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!nameInput.trim()}
            className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-40"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSaveInput(false);
              setNameInput("");
            }}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30"
          >
            취소
          </button>
        </div>
      )}

      {atLimit && (
        <p className="mt-1 w-full text-xs text-amber-700">
          최대 {FILTER_PRESET_MAX}개까지 저장할 수 있습니다. 기존 프리셋을 먼저 삭제하세요.
        </p>
      )}
    </div>
  );
}
