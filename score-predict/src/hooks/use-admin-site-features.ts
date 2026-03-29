"use client";

import { useEffect, useState } from "react";
import {
  ADMIN_SITE_SETTINGS_UPDATED_EVENT,
  loadSettings,
} from "@/app/admin/site/_lib/site-settings-client";
import {
  ADMIN_SITE_FEATURE_DEFAULTS,
  resolveAdminSiteFeatureState,
  type AdminSiteFeatureKey,
} from "@/lib/admin-site-features.shared";

export function useAdminSiteFeatures() {
  const [features, setFeatures] = useState(ADMIN_SITE_FEATURE_DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchFeatures() {
      setIsLoading(true);

      try {
        const settings = await loadSettings();
        if (!cancelled) {
          setFeatures(resolveAdminSiteFeatureState(settings));
        }
      } catch {
        if (!cancelled) {
          setFeatures(ADMIN_SITE_FEATURE_DEFAULTS);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchFeatures();

    function handleSettingsUpdated() {
      void fetchFeatures();
    }

    window.addEventListener(ADMIN_SITE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener(
        ADMIN_SITE_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated
      );
    };
  }, []);

  return {
    features,
    isLoading,
  };
}

export function useAdminSiteFeature(feature: AdminSiteFeatureKey) {
  const { features, isLoading } = useAdminSiteFeatures();

  return {
    enabled: features[feature],
    features,
    isLoading,
  };
}
