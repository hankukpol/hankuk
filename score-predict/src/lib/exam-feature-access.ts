import { getExamSurfaceState } from "@/lib/exam-surface";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export type ExamFeatureKey =
  | "main"
  | "input"
  | "result"
  | "final"
  | "prediction"
  | "comments"
  | "notices"
  | "faq";

const EXAM_FEATURE_LABELS: Record<ExamFeatureKey, string> = {
  main: "\ud480\uc11c\ube44\uc2a4 \uba54\uc778",
  input: "\uc751\uc2dc\uc815\ubcf4 \uc785\ub825",
  result: "\ub0b4 \uc131\uc801 \ubd84\uc11d",
  final: "\ucd5c\uc885 \uc608\uc0c1 \ucef7",
  prediction: "\ud569\uaca9 \uc608\uce21 \uc815\ubcf4",
  comments: "\uc2e4\uc2dc\uac04 \ub313\uae00",
  notices: "\uacf5\uc9c0\uc0ac\ud56d",
  faq: "FAQ",
};

export async function getExamFeatureAccess(feature: ExamFeatureKey) {
  const settings = await getSiteSettingsUncached();
  const surfaceState = getExamSurfaceState(settings);

  return {
    enabled: surfaceState.items[feature].enabled,
    lockedMessage: surfaceState.tabLockedMessage,
    label: EXAM_FEATURE_LABELS[feature],
  };
}
