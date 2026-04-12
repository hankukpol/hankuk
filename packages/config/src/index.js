export const HANKUK_APP_KEYS = Object.freeze({
  PORTAL: "portal",
  SCORE_PREDICT: "score-predict",
  STUDY_HALL: "study-hall",
  INTERVIEW_PASS: "interview-pass",
  CLASS_PASS: "class-pass",
  INTERVIEW_MATE: "interview-mate",
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
  [HANKUK_APP_KEYS.SCORE_PREDICT]: Object.freeze({
    appKey: HANKUK_APP_KEYS.SCORE_PREDICT,
    displayName: "Score Predict",
    schemaName: "score_predict",
    domainAlias: "score",
    rootDirectory: "apps/score-predict",
    productionUrl: "https://score-predict.vercel.app",
    portalLaunch: Object.freeze({
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
    rootDirectory: "interview-mate",
    productionUrl: "https://interview-mate-lime.vercel.app",
    portalLaunch: Object.freeze({
      requiresDivision: true,
    }),
  }),
});

export const HANKUK_DIVISION_SLUGS = Object.freeze(["police", "fire"]);

export const HANKUK_PLACEHOLDER_EMAIL_DOMAIN = "identity.hankukpol.local";

export const SCORE_PREDICT_RUNTIME_SCHEMAS = Object.freeze({
  fire: "score_predict_fire",
  police: "score_predict_police",
});

export function getHankukServiceConfig(appKey) {
  return HANKUK_SERVICE_CONFIG[appKey] ?? null;
}
