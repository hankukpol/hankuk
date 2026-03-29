import type { SiteSettingsMap } from "@/lib/site-settings.constants";

export type ExamSurfaceKey =
  | "main"
  | "input"
  | "result"
  | "final"
  | "prediction"
  | "comments"
  | "notices"
  | "faq";

export interface ExamSurfaceItem {
  key: ExamSurfaceKey;
  href: string;
  enabled: boolean;
  requiresSubmission: boolean;
}

export interface ExamSurfaceRouteOptions {
  isAuthenticated: boolean;
  hasSubmission: boolean;
}

export interface ExamSurfaceTabOptions {
  isAuthenticated: boolean;
  canAccessRestrictedTabs: boolean;
  isAdmin?: boolean;
}

export interface ExamSurfaceState {
  items: Record<ExamSurfaceKey, ExamSurfaceItem>;
  tabEnabled: Record<ExamSurfaceKey, boolean>;
  finalPredictionEnabled: boolean;
  commentsEnabled: boolean;
  noticesEnabled: boolean;
  tabLockedMessage: string;
}

interface ExamSurfaceStateOptions {
  defaultLockedMessage?: string;
}

const EXAM_SURFACES: Record<ExamSurfaceKey, Omit<ExamSurfaceItem, "enabled">> = {
  main: { key: "main", href: "/exam/main", requiresSubmission: false },
  input: { key: "input", href: "/exam/input", requiresSubmission: false },
  result: { key: "result", href: "/exam/result", requiresSubmission: true },
  final: { key: "final", href: "/exam/final", requiresSubmission: true },
  prediction: { key: "prediction", href: "/exam/prediction", requiresSubmission: true },
  comments: { key: "comments", href: "/exam/comments", requiresSubmission: true },
  notices: { key: "notices", href: "/exam/notices", requiresSubmission: false },
  faq: { key: "faq", href: "/exam/faq", requiresSubmission: false },
};

const PUBLIC_ROUTE_PRIORITY: ExamSurfaceKey[] = ["main", "input", "notices", "faq"];
const AUTH_ROUTE_PRIORITY: ExamSurfaceKey[] = [
  "main",
  "result",
  "prediction",
  "final",
  "comments",
  "input",
  "notices",
  "faq",
];
const FALLBACK_ROUTE_PRIORITY: ExamSurfaceKey[] = [
  "main",
  "input",
  "result",
  "prediction",
  "final",
  "comments",
  "notices",
  "faq",
];

export const DEFAULT_TAB_LOCKED_MESSAGE = "\uc2dc\ud5d8 \uc815\ubcf4\ub294 \uc900\ube44 \uc911\uc785\ub2c8\ub2e4.";

function isEnabledSurface(item: ExamSurfaceItem, options: ExamSurfaceRouteOptions) {
  if (!item.enabled) {
    return false;
  }

  if (item.requiresSubmission) {
    return options.isAuthenticated && options.hasSubmission;
  }

  return true;
}

function findSurfaceByPriority(
  items: Record<ExamSurfaceKey, ExamSurfaceItem>,
  priority: ExamSurfaceKey[],
  options: ExamSurfaceRouteOptions
) {
  return priority
    .map((key) => items[key])
    .find((item) => item && isEnabledSurface(item, options));
}

export function getExamSurfaceItems(settings: SiteSettingsMap): Record<ExamSurfaceKey, ExamSurfaceItem> {
  return {
    main: {
      ...EXAM_SURFACES.main,
      enabled: Boolean(settings["site.tabMainEnabled"] ?? true),
    },
    input: {
      ...EXAM_SURFACES.input,
      enabled: Boolean(settings["site.tabInputEnabled"] ?? true),
    },
    result: {
      ...EXAM_SURFACES.result,
      enabled: Boolean(settings["site.tabResultEnabled"] ?? true),
    },
    final: {
      ...EXAM_SURFACES.final,
      enabled: Boolean(settings["site.finalPredictionEnabled"] ?? false),
    },
    prediction: {
      ...EXAM_SURFACES.prediction,
      enabled: Boolean(settings["site.tabPredictionEnabled"] ?? true),
    },
    comments: {
      ...EXAM_SURFACES.comments,
      enabled: Boolean(settings["site.commentsEnabled"] ?? true),
    },
    notices: {
      ...EXAM_SURFACES.notices,
      enabled: Boolean(settings["site.tabNoticesEnabled"] ?? true),
    },
    faq: {
      ...EXAM_SURFACES.faq,
      enabled: Boolean(settings["site.tabFaqEnabled"] ?? true),
    },
  };
}

export function getExamSurfaceState(
  settings: SiteSettingsMap,
  options: ExamSurfaceStateOptions = {}
): ExamSurfaceState {
  const items = getExamSurfaceItems(settings);
  const fallbackLockedMessage = options.defaultLockedMessage ?? DEFAULT_TAB_LOCKED_MESSAGE;

  return {
    items,
    tabEnabled: {
      main: items.main.enabled,
      input: items.input.enabled,
      result: items.result.enabled,
      final: items.final.enabled,
      prediction: items.prediction.enabled,
      comments: items.comments.enabled,
      notices: items.notices.enabled,
      faq: items.faq.enabled,
    },
    finalPredictionEnabled: items.final.enabled,
    commentsEnabled: items.comments.enabled,
    noticesEnabled: items.notices.enabled,
    tabLockedMessage: String(settings["site.tabLockedMessage"] ?? fallbackLockedMessage),
  };
}

export function getPreferredExamRoute(settings: SiteSettingsMap, options: ExamSurfaceRouteOptions) {
  const items = getExamSurfaceItems(settings);
  const priority = options.isAuthenticated ? AUTH_ROUTE_PRIORITY : PUBLIC_ROUTE_PRIORITY;

  return (
    findSurfaceByPriority(items, priority, options) ??
    findSurfaceByPriority(items, FALLBACK_ROUTE_PRIORITY, options) ??
    items.main
  );
}

export function getSecondaryExamRoute(settings: SiteSettingsMap, options: ExamSurfaceRouteOptions) {
  const items = getExamSurfaceItems(settings);
  const inputRoute = items.input;

  if (isEnabledSurface(inputRoute, options)) {
    return inputRoute;
  }

  return getPreferredExamRoute(settings, options);
}

export function getPreferredExamTab(
  items: Record<ExamSurfaceKey, ExamSurfaceItem>,
  options: ExamSurfaceTabOptions
): ExamSurfaceKey {
  const priority = options.isAuthenticated ? AUTH_ROUTE_PRIORITY : PUBLIC_ROUTE_PRIORITY;

  const preferred = priority.find((key) => {
    const item = items[key];
    if (!item || !item.enabled) {
      return false;
    }

    if (item.requiresSubmission) {
      return options.canAccessRestrictedTabs;
    }

    return true;
  });

  if (preferred) {
    return preferred;
  }

  if (options.isAdmin) {
    const adminPreviewTab = FALLBACK_ROUTE_PRIORITY.find((key) => items[key]?.enabled);
    if (adminPreviewTab) {
      return adminPreviewTab;
    }
  }

  return "main";
}
