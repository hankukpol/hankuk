"use client";

import { useState } from "react";
import type { FilterPreset } from "@/hooks/use-filter-presets";

type Props = {
  presets: FilterPreset[];
  currentFilters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
  onSave: (name: string, filters: Record<string, string>) => void;
  onDelete: (id: string) => void;
};

export function FilterPresetBar({
  presets,
  currentFilters,
  onApply,
  onSave,
  onDelete,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");

  const hasActiveFilters = Object.values(currentFilters).some((v) => v !== "" && v !== undefined);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((preset) => (
        <div key={preset.id} className="flex items-center">
          <button
            onClick={() => onApply(preset.filters)}
            className="inline-flex items-center rounded-l-full border border-r-0 border-ink/15 bg-white px-3 py-1 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
          >
            {preset.name}
          </button>
          <button
            onClick={() => onDelete(preset.id)}
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-r-full border border-ink/15 bg-white text-slate/50 transition hover:bg-red-50 hover:text-red-600"
            title="프리셋 삭제"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      {hasActiveFilters && !saving && (
        <button
          onClick={() => setSaving(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink/20 px-3 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          현재 필터 저장
        </button>
      )}

      {saving && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="프리셋 이름"
            autoFocus
            className="h-[26px] rounded-full border border-forest/30 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-forest/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(presetName, currentFilters);
                setPresetName("");
                setSaving(false);
              }
              if (e.key === "Escape") {
                setSaving(false);
                setPresetName("");
              }
            }}
          />
          <button
            onClick={() => {
              onSave(presetName, currentFilters);
              setPresetName("");
              setSaving(false);
            }}
            className="inline-flex h-[26px] items-center rounded-full bg-forest px-3 text-xs font-semibold text-white"
          >
            저장
          </button>
          <button
            onClick={() => { setSaving(false); setPresetName(""); }}
            className="inline-flex h-[26px] items-center rounded-full border border-ink/15 px-3 text-xs text-slate"
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}
