const REMOTE_HOST_PATTERNS = [
  "supabase.co",
  "pooler.supabase.com",
  "neon.tech",
  "planetscale.com",
  "amazonaws.com",
  "azure.com",
];

function isLocalRuntime() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    process.env.NODE_ENV !== "production" ||
    appUrl.includes("localhost") ||
    appUrl.includes("127.0.0.1")
  );
}

function isRemoteHost(value: string) {
  try {
    const url = new URL(value);
    return REMOTE_HOST_PATTERNS.some((pattern) => url.hostname.includes(pattern));
  } catch {
    return REMOTE_HOST_PATTERNS.some((pattern) => value.includes(pattern));
  }
}

function allowsRemoteAccessInLocal() {
  return (
    process.env.ALLOW_REMOTE_DATABASE_IN_LOCAL === "true" ||
    process.env.NEXT_PUBLIC_ALLOW_REMOTE_SUPABASE_IN_LOCAL === "true"
  );
}

export function assertLocalRuntimeDoesNotUseRemoteDatabase(value: string | undefined) {
  if (!value || !isLocalRuntime() || allowsRemoteAccessInLocal() || !isRemoteHost(value)) {
    return;
  }

  throw new Error(
    "Local runtime is configured with a remote DATABASE_URL. Point .env.local to local Supabase, or set ALLOW_REMOTE_DATABASE_IN_LOCAL=true intentionally.",
  );
}

export function assertLocalRuntimeDoesNotUseRemoteSupabase(value: string | undefined) {
  if (!value || !isLocalRuntime() || allowsRemoteAccessInLocal() || !isRemoteHost(value)) {
    return;
  }

  throw new Error(
    "Local runtime is configured with a remote Supabase URL. Point .env.local to local Supabase, or set NEXT_PUBLIC_ALLOW_REMOTE_SUPABASE_IN_LOCAL=true intentionally.",
  );
}
