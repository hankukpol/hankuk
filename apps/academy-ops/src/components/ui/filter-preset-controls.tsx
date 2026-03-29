"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFilterPresets } from "@/hooks/use-filter-presets";

type FilterPresetControlsProps = {
  pathname: string;
  storageKey: string;
  currentFilters: Record<string, string>;
  formId?: string;
};

function buildQueryString(filters: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    const trimmedValue = value.trim();
    if (trimmedValue) {
      params.set(key, trimmedValue);
    }
  }

  return params.toString();
}

function readFiltersFromForm(formId: string | undefined, fallbackFilters: Record<string, string>) {
  if (!formId) {
    return fallbackFilters;
  }

  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) {
    return fallbackFilters;
  }

  const formData = new FormData(form);
  const nextFilters = { ...fallbackFilters };

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      nextFilters[key] = value;
    }
  }

  return nextFilters;
}

export function FilterPresetControls({
  pathname,
  storageKey,
  currentFilters,
  formId,
}: FilterPresetControlsProps) {
  const router = useRouter();
  const { presets, savePreset, deletePreset } = useFilterPresets(storageKey);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  function applyPreset(presetId: string) {
    setSelectedPresetId(presetId);

    const preset = presets.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }

    const queryString = buildQueryString(preset.filters);
    router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function handleSave() {
    const name = window.prompt("프리셋 이름을 입력하세요.");
    if (!name) {
      return;
    }

    const preset = savePreset(name, readFiltersFromForm(formId, currentFilters));
    if (preset) {
      setNotice("현재 필터를 저장했습니다.");
      setSelectedPresetId(preset.id);
    }
  }

  function handleDelete() {
    if (!selectedPreset) {
      return;
    }

    const confirmed = window.confirm(`'${selectedPreset.name}' 프리셋을 삭제하시겠습니까?`);
    if (!confirmed) {
      return;
    }

    deletePreset(selectedPreset.id);
    setSelectedPresetId("");
    setNotice("선택한 프리셋을 삭제했습니다.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedPresetId}
        onChange={(event) => applyPreset(event.target.value)}
        className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm"
      >
        <option value="">프리셋 선택...</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleSave}
        className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
      >
        현재 필터 저장
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={!selectedPreset}
        className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold transition hover:border-red-200 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        프리셋 삭제
      </button>
      {notice ? <span className="text-xs font-medium text-forest">{notice}</span> : null}
    </div>
  );
}