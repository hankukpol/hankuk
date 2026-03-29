const requiredSupabaseKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const requiredDatabaseKeys = ["DATABASE_URL", "DIRECT_URL"] as const;

const requiredNotificationKeys = [
  "SOLAPI_API_KEY",
  "SOLAPI_API_SECRET",
  "SOLAPI_SENDER",
] as const;

const requiredWebPushKeys = [
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

export function isLocalMockMode() {
  const mode = (
    process.env.LOCAL_DEV_MODE ??
    process.env.NEXT_PUBLIC_LOCAL_DEV_MODE ??
    ""
  )
    .trim()
    .toLowerCase();

  return mode === "mock";
}

export function hasSupabaseConfig() {
  return requiredSupabaseKeys.every((key) => Boolean(process.env[key]));
}

export function hasDatabaseConfig() {
  return requiredDatabaseKeys.every((key) => Boolean(process.env[key]));
}

export function hasServiceRoleConfig() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasNotificationConfig() {
  return requiredNotificationKeys.every((key) => Boolean(process.env[key]));
}

export function hasWebPushConfig() {
  return requiredWebPushKeys.every((key) => Boolean(process.env[key]));
}

export function getRequiredSupabaseAdminEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role 환경 변수가 설정되지 않았습니다.");
  }

  return {
    url,
    serviceRoleKey,
  };
}

export function getRequiredWebPushEnv() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("Web Push 환경 변수가 설정되지 않았습니다.");
  }

  return {
    publicKey,
    privateKey,
    subject,
  };
}

export function getMissingEnvKeys() {
  const requiredKeys = isLocalMockMode()
    ? [...requiredDatabaseKeys]
    : [...requiredSupabaseKeys, ...requiredDatabaseKeys];

  return requiredKeys.filter((key) => !process.env[key]);
}

export function getMissingNotificationEnvKeys() {
  return requiredNotificationKeys.filter((key) => !process.env[key]);
}

export function getMissingWebPushKeys() {
  return requiredWebPushKeys.filter((key) => !process.env[key]);
}

export function getSetupState() {
  const localMockMode = isLocalMockMode();

  return {
    localMockMode,
    supabaseReady: localMockMode || hasSupabaseConfig(),
    databaseReady: hasDatabaseConfig(),
    serviceRoleReady: hasServiceRoleConfig(),
    notificationReady: hasNotificationConfig(),
    webPushReady: hasWebPushConfig(),
    missingKeys: getMissingEnvKeys(),
    missingNotificationKeys: getMissingNotificationEnvKeys(),
    missingWebPushKeys: getMissingWebPushKeys(),
  };
}
