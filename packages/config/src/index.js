export const HANKUK_APP_KEYS = Object.freeze({
  SCORE_PREDICT: "score-predict",
  STUDY_HALL: "study-hall",
  INTERVIEW_PASS: "interview-pass",
  INTERVIEW_MATE: "interview-mate",
});

export const HANKUK_SERVICE_CONFIG = Object.freeze({
  [HANKUK_APP_KEYS.SCORE_PREDICT]: Object.freeze({
    appKey: HANKUK_APP_KEYS.SCORE_PREDICT,
    displayName: "Score Predict",
    schemaName: "score_predict",
    domainAlias: "score",
    rootDirectory: "apps/score-predict",
    productionUrl: "https://score-predict.vercel.app",
  }),
  [HANKUK_APP_KEYS.STUDY_HALL]: Object.freeze({
    appKey: HANKUK_APP_KEYS.STUDY_HALL,
    displayName: "Study Hall",
    schemaName: "study_hall",
    domainAlias: "studyhall",
    rootDirectory: "apps/study-hall",
    productionUrl: "https://study-hall-six.vercel.app",
  }),
  [HANKUK_APP_KEYS.INTERVIEW_PASS]: Object.freeze({
    appKey: HANKUK_APP_KEYS.INTERVIEW_PASS,
    displayName: "Interview Pass",
    schemaName: "interview",
    domainAlias: "interview",
    rootDirectory: "apps/interview-pass",
    productionUrl: "https://interview-pass.vercel.app",
  }),
  [HANKUK_APP_KEYS.INTERVIEW_MATE]: Object.freeze({
    appKey: HANKUK_APP_KEYS.INTERVIEW_MATE,
    displayName: "Interview Mate",
    schemaName: "interview_mate",
    domainAlias: "interview-mate",
    rootDirectory: "interview-mate",
    productionUrl: "https://interview-mate-lime.vercel.app",
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
