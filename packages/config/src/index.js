export const HANKUK_APP_KEYS = Object.freeze({
  PORTAL: "portal",
  ACADEMY_OPS: "academy-ops",
  SCORE_PREDICT: "score-predict",
  STUDY_HALL: "study-hall",
  INTERVIEW_PASS: "interview-pass",
  CLASS_PASS: "class-pass",
  INTERVIEW_MATE: "interview-mate",
});

export const HANKUK_PORTAL_TARGET_ROLES = Object.freeze([
  "super_admin",
  "admin",
  "assistant",
  "staff",
]);

export const HANKUK_PUBLIC_BASE_DOMAIN = "hankukpol.co.kr";

export const HANKUK_PORTAL_BRIDGE_ROLE_POLICY = Object.freeze({
  [HANKUK_APP_KEYS.PORTAL]: Object.freeze({
    appRoles: Object.freeze([]),
    divisionRoles: Object.freeze([]),
  }),
  [HANKUK_APP_KEYS.ACADEMY_OPS]: Object.freeze({
    appRoles: Object.freeze(["super_admin", "admin"]),
    divisionRoles: Object.freeze([]),
  }),
  [HANKUK_APP_KEYS.SCORE_PREDICT]: Object.freeze({
    appRoles: Object.freeze([]),
    divisionRoles: Object.freeze(["admin"]),
  }),
  [HANKUK_APP_KEYS.STUDY_HALL]: Object.freeze({
    appRoles: Object.freeze(["super_admin"]),
    divisionRoles: Object.freeze(["admin", "assistant"]),
  }),
  [HANKUK_APP_KEYS.INTERVIEW_PASS]: Object.freeze({
    appRoles: Object.freeze([]),
    divisionRoles: Object.freeze(["admin"]),
  }),
  [HANKUK_APP_KEYS.CLASS_PASS]: Object.freeze({
    appRoles: Object.freeze(["super_admin"]),
    divisionRoles: Object.freeze(["admin", "staff"]),
  }),
  [HANKUK_APP_KEYS.INTERVIEW_MATE]: Object.freeze({
    appRoles: Object.freeze([]),
    divisionRoles: Object.freeze([]),
  }),
});

export const HANKUK_SERVICE_CONFIG = Object.freeze({
  [HANKUK_APP_KEYS.PORTAL]: Object.freeze({
    appKey: HANKUK_APP_KEYS.PORTAL,
    displayName: "Unified Portal",
    schemaName: "portal",
    domainAlias: "portal",
    rootDirectory: "apps/portal",
    productionUrl: "https://portal-hankuk.vercel.app",
    portalLaunch: Object.freeze({
      superAdminPath: "/",
      requiresDivision: false,
    }),
  }),
  [HANKUK_APP_KEYS.ACADEMY_OPS]: Object.freeze({
    appKey: HANKUK_APP_KEYS.ACADEMY_OPS,
    displayName: "Academy Ops",
    schemaName: "academy_ops",
    domainAlias: "academy",
    rootDirectory: "apps/academy-ops",
    productionUrl: "https://academy-ops.vercel.app",
    portalLaunch: Object.freeze({
      superAdminPath: "/admin",
      adminPath: "/admin",
      requiresDivision: false,
    }),
  }),
  [HANKUK_APP_KEYS.SCORE_PREDICT]: Object.freeze({
    appKey: HANKUK_APP_KEYS.SCORE_PREDICT,
    displayName: "Score Predict",
    schemaName: "score_predict",
    domainAlias: "score",
    rootDirectory: "apps/score-predict",
    productionUrl: "https://score-predict.vercel.app",
    portalLaunch: Object.freeze({
      adminPath: "/{division}/admin",
      requiresDivision: true,
    }),
  }),
  [HANKUK_APP_KEYS.STUDY_HALL]: Object.freeze({
    appKey: HANKUK_APP_KEYS.STUDY_HALL,
    displayName: "Study Hall",
    schemaName: "study_hall",
    domainAlias: "studyhall",
    rootDirectory: "apps/study-hall",
    productionUrl: "https://study-hall-six.vercel.app",
    portalLaunch: Object.freeze({
      superAdminPath: "/super-admin",
      adminPath: "/{division}/admin",
      assistantPath: "/{division}/assistant",
      requiresDivision: true,
    }),
  }),
  [HANKUK_APP_KEYS.INTERVIEW_PASS]: Object.freeze({
    appKey: HANKUK_APP_KEYS.INTERVIEW_PASS,
    displayName: "Interview Pass",
    schemaName: "interview",
    domainAlias: "interview",
    rootDirectory: "apps/interview-pass",
    productionUrl: "https://interview-pass.vercel.app",
    portalLaunch: Object.freeze({
      adminPath: "/{division}/dashboard",
      requiresDivision: true,
    }),
  }),
  [HANKUK_APP_KEYS.CLASS_PASS]: Object.freeze({
    appKey: HANKUK_APP_KEYS.CLASS_PASS,
    displayName: "Class Pass",
    schemaName: "class_pass",
    domainAlias: "classpass",
    rootDirectory: "apps/class-pass",
    productionUrl: "https://class-pass.vercel.app",
    portalLaunch: Object.freeze({
      superAdminPath: "/super-admin",
      adminPath: "/{division}/dashboard",
      staffPath: "/{division}/scan",
      requiresDivision: true,
    }),
  }),
  [HANKUK_APP_KEYS.INTERVIEW_MATE]: Object.freeze({
    appKey: HANKUK_APP_KEYS.INTERVIEW_MATE,
    displayName: "Interview Mate",
    schemaName: "interview_mate",
    domainAlias: "interview-mate",
    rootDirectory: "apps/interview-mate",
    productionUrl: "https://interview-mate-lime.vercel.app",
    portalLaunch: Object.freeze({
      requiresDivision: true,
    }),
  }),
});

export const HANKUK_DIVISION_SLUGS = Object.freeze(["police", "fire"]);
export const HANKUK_PORTAL_QUICK_SWITCH_APP_KEYS = Object.freeze([
  HANKUK_APP_KEYS.CLASS_PASS,
  HANKUK_APP_KEYS.STUDY_HALL,
  HANKUK_APP_KEYS.INTERVIEW_PASS,
  HANKUK_APP_KEYS.SCORE_PREDICT,
]);

export const HANKUK_PLACEHOLDER_EMAIL_DOMAIN = "identity.hankukpol.local";

export const SCORE_PREDICT_RUNTIME_SCHEMAS = Object.freeze({
  fire: "score_predict_fire",
  police: "score_predict_police",
});

export function getHankukServiceConfig(appKey) {
  return HANKUK_SERVICE_CONFIG[appKey] ?? null;
}

export function getHankukPortalBridgeRolePolicy(appKey) {
  return HANKUK_PORTAL_BRIDGE_ROLE_POLICY[appKey] ?? null;
}

export function isHankukPortalBridgeRoleAllowed(appKey, role) {
  const policy = getHankukPortalBridgeRolePolicy(appKey);
  if (!policy) {
    return false;
  }

  return policy.appRoles.includes(role) || policy.divisionRoles.includes(role);
}

function normalizeServiceUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getHankukServiceCanonicalUrl(appKey) {
  const config = getHankukServiceConfig(appKey);
  if (!config) {
    return null;
  }

  return `https://${config.domainAlias}.${HANKUK_PUBLIC_BASE_DOMAIN}`;
}

export function getHankukServiceOrigins(appKey) {
  const config = getHankukServiceConfig(appKey);
  if (!config) {
    return [];
  }

  return Array.from(
    new Set(
      [getHankukServiceCanonicalUrl(appKey), config.productionUrl]
        .map(normalizeServiceUrl)
        .filter(Boolean),
    ),
  );
}

export function getHankukPortalLaunchPath(input) {
  const params = new URLSearchParams({
    app: input.appKey,
    role: input.role,
  });

  if (input.divisionSlug) {
    params.set("division", input.divisionSlug);
  }

  return `/launch?${params.toString()}`;
}

export function getHankukPortalLaunchUrl(input) {
  const portalOrigin =
    normalizeServiceUrl(input.portalUrl) ??
    getHankukServiceCanonicalUrl(HANKUK_APP_KEYS.PORTAL) ??
    "";

  return `${portalOrigin}${getHankukPortalLaunchPath(input)}`;
}

export function getHankukPortalQuickSwitchTargets(input) {
  const includeAppKeys = Array.isArray(input.includeAppKeys) && input.includeAppKeys.length > 0
    ? input.includeAppKeys
    : HANKUK_PORTAL_QUICK_SWITCH_APP_KEYS;
  const normalizedDivision = HANKUK_DIVISION_SLUGS.includes(input.divisionSlug)
    ? input.divisionSlug
    : null;

  return Array.from(new Set(includeAppKeys))
    .filter((appKey) => appKey !== HANKUK_APP_KEYS.PORTAL && appKey !== input.currentAppKey)
    .flatMap((appKey) => {
      const config = getHankukServiceConfig(appKey);
      const launch = config?.portalLaunch;

      if (!config || !launch) {
        return [];
      }

      if (input.role === "super_admin") {
        if (!launch.superAdminPath) {
          return [];
        }

        return [{
          appKey,
          displayName: config.displayName,
          role: input.role,
          divisionSlug: null,
        }];
      }

      if (input.role === "admin") {
        if (!launch.adminPath) {
          return [];
        }

        if (launch.requiresDivision && !normalizedDivision) {
          return [];
        }

        return [{
          appKey,
          displayName: config.displayName,
          role: input.role,
          divisionSlug: launch.requiresDivision ? normalizedDivision : null,
        }];
      }

      if (input.role === "assistant") {
        if (!launch.assistantPath || !normalizedDivision) {
          return [];
        }

        return [{
          appKey,
          displayName: config.displayName,
          role: input.role,
          divisionSlug: normalizedDivision,
        }];
      }

      if (!launch.staffPath || !normalizedDivision) {
        return [];
      }

      return [{
        appKey,
        displayName: config.displayName,
        role: input.role,
        divisionSlug: normalizedDivision,
      }];
    });
}
