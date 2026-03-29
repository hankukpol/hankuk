"use client";

import { useEffect, useState } from "react";
import useConfirmModal from "@/hooks/useConfirmModal";
import {
  ADMIN_SITE_SETTINGS_UPDATED_EVENT,
  loadSettings,
  saveSettings,
  type SettingValue,
  type SiteSettingsMap,
} from "./site-settings-client";
import {
  isSiteSettingsSectionEnabled,
  type SiteSettingsSectionKey,
} from "./site-settings-sections";

export type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

type SavePayload = Record<string, SettingValue>;

type UseSiteSettingsManagerOptions = {
  section: SiteSettingsSectionKey;
  loadErrorMessage: string;
  saveErrorMessage: string;
  successMessage: string;
  confirmTitle: string;
  confirmDescription: string;
  buildPayload: (settings: SiteSettingsMap) => SavePayload | Promise<SavePayload>;
};

export function useSiteSettingsState(
  loadErrorMessage: string,
  section?: SiteSettingsSectionKey
) {
  const [settings, setSettings] = useState<SiteSettingsMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSettings() {
      setIsLoading(true);
      setNotice(null);

      try {
        const nextSettings = await loadSettings(section);
        if (!cancelled) {
          setSettings(nextSettings);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            type: "error",
            message: error instanceof Error ? error.message : loadErrorMessage,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchSettings();

    function handleSettingsUpdated() {
      void fetchSettings();
    }

    if (typeof window !== "undefined") {
      window.addEventListener(ADMIN_SITE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(ADMIN_SITE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
      }
    };
  }, [loadErrorMessage, section]);

  async function reload() {
    try {
      const nextSettings = await loadSettings(section);
      setSettings(nextSettings);
      return nextSettings;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(loadErrorMessage);
    }
  }

  function updateSetting(key: string, value: SettingValue) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return {
    settings,
    setSettings,
    updateSetting,
    sectionEnabled: section ? isSiteSettingsSectionEnabled(settings, section) : true,
    isLoading,
    notice,
    setNotice,
    reload,
  };
}

export function useSiteSettingsManager(options: UseSiteSettingsManagerOptions) {
  const { confirm, modalProps } = useConfirmModal();
  const [isSaving, setIsSaving] = useState(false);
  const state = useSiteSettingsState(options.loadErrorMessage, options.section);

  async function handleSave() {
    const ok = await confirm({
      title: options.confirmTitle,
      description: options.confirmDescription,
    });
    if (!ok) return;

    setIsSaving(true);
    state.setNotice(null);

    try {
      const payload = await options.buildPayload(state.settings);
      await saveSettings(payload, options.section);
      await state.reload();
      state.setNotice({ type: "success", message: options.successMessage });
    } catch (error) {
      state.setNotice({
        type: "error",
        message: error instanceof Error ? error.message : options.saveErrorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return {
    ...state,
    isSaving,
    handleSave,
    modalProps,
  };
}
