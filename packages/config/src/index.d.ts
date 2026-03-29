export type HankukAppKey =
  | "score-predict"
  | "study-hall"
  | "interview-pass"
  | "interview-mate";

export type HankukSchemaName =
  | "score_predict"
  | "study_hall"
  | "interview"
  | "interview_mate";

export type HankukDivisionSlug = "police" | "fire";

export type HankukServiceConfig = {
  appKey: HankukAppKey;
  displayName: string;
  schemaName: HankukSchemaName;
  domainAlias: string;
  rootDirectory: string;
  productionUrl: string;
};

export const HANKUK_APP_KEYS: {
  readonly SCORE_PREDICT: "score-predict";
  readonly STUDY_HALL: "study-hall";
  readonly INTERVIEW_PASS: "interview-pass";
  readonly INTERVIEW_MATE: "interview-mate";
};

export const HANKUK_SERVICE_CONFIG: Readonly<Record<HankukAppKey, HankukServiceConfig>>;

export const HANKUK_DIVISION_SLUGS: readonly HankukDivisionSlug[];

export const HANKUK_PLACEHOLDER_EMAIL_DOMAIN: "identity.hankukpol.local";

export const SCORE_PREDICT_RUNTIME_SCHEMAS: {
  readonly fire: "score_predict_fire";
  readonly police: "score_predict_police";
};

export function getHankukServiceConfig(appKey: HankukAppKey): HankukServiceConfig;
