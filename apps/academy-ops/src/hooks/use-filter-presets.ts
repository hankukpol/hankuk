"use client";

import { useEffect, useState } from "react";

export const FILTER_PRESET_MAX = 5;

export type FilterPreset = {
  id: string;
  name: string;
  filters: Record<string, string>;
  createdAt: string;
};

function isFilterPreset(value: unknown): value is FilterPreset {
  if (!value || typeof value !== "object") {
    return false;
  }

  const preset = value as Partial<FilterPreset>;
  return (
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.createdAt === "string" &&
    !!preset.filters &&
    typeof preset.filters === "object" &&
    !Array.isArray(preset.filters)
  );
}

function readPresets(storageKey: string) {
  if (typeof window === "undefined") {
    return [] as FilterPreset[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [] as FilterPreset[];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as FilterPreset[];
    }

    return parsed.filter(isFilterPreset).map((preset) => ({
      ...preset,
      filters: Object.fromEntries(
        Object.entries(preset.filters).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
    }));
  } catch {
    return [] as FilterPreset[];
  }
}

function buildPresetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useFilterPresets(storageKey: string) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);

  useEffect(() => {
    setPresets(readPresets(storageKey));
  }, [storageKey]);

  function persist(next: FilterPreset[]) {
    setPresets(next);

    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage failures so the page filter flow still works.
    }
  }

  function savePreset(name: string, filters: Record<string, string>): FilterPreset | null {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }

    if (presets.length >= FILTER_PRESET_MAX) {
      return null;
    }

    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())),
    );

    const preset = {
      id: buildPresetId(),
      name: trimmedName,
      filters: normalizedFilters,
      createdAt: new Date().toISOString(),
    };

    persist([...presets, preset]);

    return preset;
  }

  function deletePreset(id: string) {
    persist(presets.filter((preset) => preset.id !== id));
  }

  function loadPreset(id: string): Record<string, string> | null {
    const preset = presets.find((p) => p.id === id);
    return preset ? { ...preset.filters } : null;
  }

  return {
    presets,
    savePreset,
    loadPreset,
    deletePreset,
  };
}