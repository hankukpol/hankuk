import { revalidateTag } from "next/cache";

export const CACHE_TAGS = {
  analyticsDataset: "analytics-dataset",
  analyticsResultsSheet: "analytics-results-sheet",
  dashboardSummary: "dashboard-summary",
  periodsBasic: "periods-basic",
  periodWithSessions: "period-with-sessions",
} as const;

function safeRevalidateTag(tag: string) {
  try {
    revalidateTag(tag);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      message.includes("static generation store missing") ||
      message.includes("incrementalCache missing")
    ) {
      return;
    }

    throw error;
  }
}

export function revalidateAnalyticsCaches() {
  safeRevalidateTag(CACHE_TAGS.analyticsDataset);
  safeRevalidateTag(CACHE_TAGS.analyticsResultsSheet);
  safeRevalidateTag(CACHE_TAGS.dashboardSummary);
}

export function revalidatePeriodCaches() {
  safeRevalidateTag(CACHE_TAGS.periodsBasic);
  safeRevalidateTag(CACHE_TAGS.periodWithSessions);
}

export function revalidateAdminReadCaches(options?: {
  analytics?: boolean;
  periods?: boolean;
}) {
  if (options?.analytics ?? true) {
    revalidateAnalyticsCaches();
  }

  if (options?.periods) {
    revalidatePeriodCaches();
  }
}