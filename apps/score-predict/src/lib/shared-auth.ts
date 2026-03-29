import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type Role } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HANKUK_APP_KEYS, HANKUK_PLACEHOLDER_EMAIL_DOMAIN } from "@hankuk/config";

import { prisma } from "@/lib/prisma";
import { normalizeContactPhone, normalizeUsername } from "@/lib/police/validations";
import type { TenantType } from "@/lib/tenant";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/validations";

const APP_KEY = HANKUK_APP_KEYS.SCORE_PREDICT;
const DEFAULT_APP = HANKUK_APP_KEYS.SCORE_PREDICT;
const PLACEHOLDER_EMAIL_DOMAIN = HANKUK_PLACEHOLDER_EMAIL_DOMAIN;

type SharedRoleKey = "admin" | "student";
type SharedAliasType = "email" | "phone" | "username";

type SharedAlias = {
  aliasType: SharedAliasType;
  aliasValue: string;
  appKey: string | null;
  isPrimary: boolean;
  isVerified: boolean;
};

type ScorePredictLegacyIdentity = {
  legacyUserId: number;
  name: string;
  email?: string | null;
  loginIdentifier: string;
  contactPhone?: string | null;
  role: Role;
};

type SharedAuthSyncResult = {
  sharedUserId: string;
  createdAuthUser: boolean;
};

type SharedAuthPasswordSyncResult = {
  sharedUserId: string;
  passwordUpdated: boolean;
};

type SharedAuthLoginResult =
  | {
      status: "success";
      sharedUserId: string;
    }
  | {
      status: "missing";
    }
  | {
      status: "invalid";
    }
  | {
      status: "unavailable";
      error: string;
    };

type SqlExecutor = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;

type SharedAuthAccountRow = {
  id: string;
  email: string | null;
  raw_user_meta_data: Prisma.JsonValue | null;
};

let cachedAdminClient: SupabaseClient | null = null;
let cachedAnonClient: SupabaseClient | null = null;

function getSharedAuthEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url, serviceRoleKey };
}

function getSharedAuthAdminClient() {
  const env = getSharedAuthEnv();
  if (!env) {
    return null;
  }

  if (!cachedAdminClient) {
    cachedAdminClient = createClient(env.url, env.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cachedAdminClient;
}

function getSharedAuthAnonClient() {
  const env = getSharedAuthEnv();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!env || !anonKey) {
    return null;
  }

  if (!cachedAnonClient) {
    cachedAnonClient = createClient(env.url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cachedAnonClient;
}

function mapRoleKey(role: Role): SharedRoleKey {
  return role === "ADMIN" ? "admin" : "student";
}

function normalizeEmailAlias(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = normalizeEmail(value);
  return isValidEmail(normalized) ? normalized : null;
}

function normalizeProfilePhone(tenantType: TenantType, identity: ScorePredictLegacyIdentity) {
  if (tenantType === "fire") {
    const phone = normalizePhone(identity.loginIdentifier);
    return /^01\d-\d{3,4}-\d{4}$/.test(phone) ? phone : null;
  }

  const digits = normalizeContactPhone(identity.contactPhone ?? "");
  return digits.length > 0 ? digits : null;
}

function buildManagedEmail(tenantType: TenantType, identity: ScorePredictLegacyIdentity) {
  return (
    normalizeEmailAlias(identity.email) ??
    `${APP_KEY}-${tenantType}-${identity.legacyUserId}@${PLACEHOLDER_EMAIL_DOMAIN}`
  );
}

function buildAliases(tenantType: TenantType, identity: ScorePredictLegacyIdentity): SharedAlias[] {
  const aliases: SharedAlias[] = [];

  if (tenantType === "fire") {
    const normalizedPhone = normalizePhone(identity.loginIdentifier);
    if (normalizedPhone) {
      aliases.push({
        aliasType: "phone",
        aliasValue: normalizedPhone,
        appKey: APP_KEY,
        isPrimary: true,
        isVerified: true,
      });
    }
  } else {
    const normalizedUsername = normalizeUsername(identity.loginIdentifier);
    if (normalizedUsername) {
      aliases.push({
        aliasType: "username",
        aliasValue: normalizedUsername,
        appKey: APP_KEY,
        isPrimary: true,
        isVerified: true,
      });
    }
  }

  const normalizedEmail = normalizeEmailAlias(identity.email);
  if (normalizedEmail) {
    aliases.push({
      aliasType: "email",
      aliasValue: normalizedEmail,
      appKey: null,
      isPrimary: aliases.length === 0,
      isVerified: true,
    });
  }

  return aliases;
}

async function findClaimedReservationUserId(tenantType: TenantType, aliases: SharedAlias[]) {
  if (aliases.length === 0) {
    return null;
  }

  const aliasConditions = Prisma.join(
    aliases.map((alias) => Prisma.sql`(alias_type = ${alias.aliasType} and alias_value = ${alias.aliasValue})`),
    " or "
  );

  const rows = await prisma.$queryRaw<Array<{ claimed_user_id: string }>>(Prisma.sql`
    select distinct claimed_user_id::text as claimed_user_id
    from public.identity_claim_reservations
    where app_key = ${APP_KEY}
      and division_slug = ${tenantType}
      and claimed_user_id is not null
      and (${aliasConditions})
    order by claimed_user_id
    limit 1
  `);

  return rows[0]?.claimed_user_id ?? null;
}

async function findSharedLoginUserId(tenantType: TenantType, aliases: SharedAlias[]) {
  if (aliases.length === 0) {
    return null;
  }

  const aliasConditions = Prisma.join(
    aliases.map(
      (alias) => Prisma.sql`(
        coalesce(app_key, '') = coalesce(${alias.appKey}, '')
        and alias_type = ${alias.aliasType}
        and alias_value = ${alias.aliasValue}
      )`
    ),
    " or "
  );

  const aliasRows = await prisma.$queryRaw<Array<{ user_id: string }>>(Prisma.sql`
    select distinct user_id::text as user_id
    from public.user_login_aliases
    where ${aliasConditions}
    order by user_id
    limit 1
  `);

  if (aliasRows[0]?.user_id) {
    return aliasRows[0].user_id;
  }

  return findClaimedReservationUserId(tenantType, aliases);
}

async function findClaimedReservationUserIdWithExecutor(
  executor: SqlExecutor,
  tenantType: TenantType,
  aliases: SharedAlias[]
) {
  if (aliases.length === 0) {
    return null;
  }

  const aliasConditions = Prisma.join(
    aliases.map((alias) => Prisma.sql`(alias_type = ${alias.aliasType} and alias_value = ${alias.aliasValue})`),
    " or "
  );

  const rows = await executor.$queryRaw<Array<{ claimed_user_id: string }>>(Prisma.sql`
    select distinct claimed_user_id::text as claimed_user_id
    from public.identity_claim_reservations
    where app_key = ${APP_KEY}
      and division_slug = ${tenantType}
      and claimed_user_id is not null
      and (${aliasConditions})
    order by claimed_user_id
    limit 1
  `);

  return rows[0]?.claimed_user_id ?? null;
}

async function findAuthUserByEmail(email: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    select id::text as id
    from auth.users
    where lower(email) = ${email}
    order by created_at asc
    limit 1
  `);

  return rows[0]?.id ?? null;
}

async function findSharedAuthAccountById(sharedUserId: string) {
  const rows = await prisma.$queryRaw<SharedAuthAccountRow[]>(Prisma.sql`
    select
      id::text as id,
      email,
      raw_user_meta_data
    from auth.users
    where id = ${sharedUserId}::uuid
    limit 1
  `);

  return rows[0] ?? null;
}

async function authenticateSharedAuthAccount(sharedUserId: string, password: string): Promise<SharedAuthLoginResult> {
  const account = await findSharedAuthAccountById(sharedUserId);
  if (!account?.email) {
    return { status: "missing" };
  }

  const anonClient = getSharedAuthAnonClient();
  if (!anonClient) {
    return {
      status: "unavailable",
      error: "Shared Supabase auth environment variables are not configured.",
    };
  }

  const { data, error } = await anonClient.auth.signInWithPassword({
    email: account.email,
    password,
  });

  if (error || !data.user) {
    return { status: "invalid" };
  }

  if (data.user.id !== sharedUserId) {
    return { status: "invalid" };
  }

  return {
    status: "success",
    sharedUserId,
  };
}

function isManagedScorePredictAuthAccount(account: SharedAuthAccountRow | null) {
  if (!account) {
    return false;
  }

  if (account.email?.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)) {
    return true;
  }

  const metadata = account.raw_user_meta_data;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const legacySource = metadata.legacy_source;
  return typeof legacySource === "string" && legacySource.startsWith(`${APP_KEY}:`);
}

async function createManagedAuthUser(params: {
  tenantType: TenantType;
  identity: ScorePredictLegacyIdentity;
  email: string;
  password?: string;
}) {
  const adminClient = getSharedAuthAdminClient();
  if (!adminClient) {
    throw new Error("Shared Supabase auth environment variables are not configured.");
  }

  const generatedPassword = `${randomUUID()}!Aa1`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email: params.email,
    password: params.password?.trim() || generatedPassword,
    email_confirm: true,
    user_metadata: {
      name: params.identity.name,
      default_app: DEFAULT_APP,
      legacy_source: `${APP_KEY}:${params.tenantType}`,
      legacy_user_id: params.identity.legacyUserId,
    },
  });

  if (error || !data.user) {
    const existingUserId = await findAuthUserByEmail(params.email);
    if (existingUserId) {
      return {
        userId: existingUserId,
        created: false,
      };
    }

    throw new Error(error?.message ?? "Failed to create shared auth user.");
  }

  return {
    userId: data.user.id,
    created: true,
  };
}

async function ensureSharedAuthUser(
  tenantType: TenantType,
  identity: ScorePredictLegacyIdentity,
  aliases: SharedAlias[],
  password?: string
) {
  const claimedUserId = await findClaimedReservationUserId(tenantType, aliases);
  if (claimedUserId) {
    return {
      userId: claimedUserId,
      created: false,
    };
  }

  const managedEmail = buildManagedEmail(tenantType, identity);
  const existingUserId = await findAuthUserByEmail(managedEmail);
  if (existingUserId) {
    return {
      userId: existingUserId,
      created: false,
    };
  }

  return createManagedAuthUser({
    tenantType,
    identity,
    email: managedEmail,
    password,
  });
}

async function upsertUserProfile(sharedUserId: string, tenantType: TenantType, identity: ScorePredictLegacyIdentity) {
  const profilePhone = normalizeProfilePhone(tenantType, identity);

  await prisma.$executeRaw(Prisma.sql`
    insert into public.user_profiles (id, full_name, phone, default_app)
    values (${sharedUserId}::uuid, ${identity.name}, ${profilePhone}, ${DEFAULT_APP})
    on conflict (id) do update
    set
      full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
      phone = case
        when coalesce(public.user_profiles.phone, '') <> '' then public.user_profiles.phone
        else excluded.phone
      end,
      default_app = coalesce(public.user_profiles.default_app, excluded.default_app),
      updated_at = timezone('utc', now())
  `);
}

async function upsertMemberships(sharedUserId: string, tenantType: TenantType, roleKey: SharedRoleKey) {
  await prisma.$executeRaw(Prisma.sql`
    update public.user_app_memberships
    set
      status = case when role_key = ${roleKey} then 'active' else 'archived' end,
      updated_at = timezone('utc', now())
    where user_id = ${sharedUserId}::uuid
      and app_key = ${APP_KEY}
  `);

  await prisma.$executeRaw(Prisma.sql`
    insert into public.user_app_memberships (user_id, app_key, role_key, status)
    values (${sharedUserId}::uuid, ${APP_KEY}, ${roleKey}, 'active')
    on conflict (user_id, app_key, role_key) do update
    set
      status = 'active',
      updated_at = timezone('utc', now())
  `);

  await prisma.$executeRaw(Prisma.sql`
    update public.user_division_memberships
    set
      status = case when role_key = ${roleKey} then 'active' else 'archived' end,
      updated_at = timezone('utc', now())
    where user_id = ${sharedUserId}::uuid
      and app_key = ${APP_KEY}
      and division_slug = ${tenantType}
  `);

  await prisma.$executeRaw(Prisma.sql`
    insert into public.user_division_memberships (user_id, app_key, division_slug, role_key, status)
    values (${sharedUserId}::uuid, ${APP_KEY}, ${tenantType}, ${roleKey}, 'active')
    on conflict (user_id, app_key, division_slug, role_key) do update
    set
      status = 'active',
      updated_at = timezone('utc', now())
  `);
}

async function upsertLoginAlias(sharedUserId: string, alias: SharedAlias) {
  await prisma.$executeRaw(Prisma.sql`
    with updated as (
      update public.user_login_aliases
      set
        user_id = ${sharedUserId}::uuid,
        is_primary = ${alias.isPrimary},
        is_verified = ${alias.isVerified},
        updated_at = timezone('utc', now())
      where coalesce(app_key, '') = coalesce(${alias.appKey}, '')
        and alias_type = ${alias.aliasType}
        and alias_value = ${alias.aliasValue}
      returning id
    )
    insert into public.user_login_aliases (user_id, app_key, alias_type, alias_value, is_primary, is_verified)
    select ${sharedUserId}::uuid, ${alias.appKey}, ${alias.aliasType}, ${alias.aliasValue}, ${alias.isPrimary}, ${alias.isVerified}
    where not exists (select 1 from updated)
  `);
}

async function claimReservation(sharedUserId: string, tenantType: TenantType, alias: SharedAlias) {
  await prisma.$executeRaw(Prisma.sql`
    update public.identity_claim_reservations
    set
      status = 'claimed',
      claimed_user_id = ${sharedUserId}::uuid,
      updated_at = timezone('utc', now())
    where app_key = ${APP_KEY}
      and division_slug = ${tenantType}
      and alias_type = ${alias.aliasType}
      and alias_value = ${alias.aliasValue}
  `);
}

export async function ensureScorePredictSharedIdentity(params: {
  tenantType: TenantType;
  identity: ScorePredictLegacyIdentity;
  password?: string;
}): Promise<SharedAuthSyncResult> {
  if (!getSharedAuthEnv()) {
    throw new Error("Shared Supabase auth environment variables are not configured.");
  }

  const aliases = buildAliases(params.tenantType, params.identity);
  if (aliases.length === 0) {
    throw new Error("At least one shared auth alias is required.");
  }

  const { userId, created } = await ensureSharedAuthUser(
    params.tenantType,
    params.identity,
    aliases,
    params.password
  );
  const roleKey = mapRoleKey(params.identity.role);

  await upsertUserProfile(userId, params.tenantType, params.identity);
  await upsertMemberships(userId, params.tenantType, roleKey);

  for (const alias of aliases) {
    await upsertLoginAlias(userId, alias);
    await claimReservation(userId, params.tenantType, alias);
  }

  return {
    sharedUserId: userId,
    createdAuthUser: created,
  };
}

export async function authenticateScorePredictSharedIdentity(params: {
  tenantType: TenantType;
  identity: ScorePredictLegacyIdentity;
  password: string;
}): Promise<SharedAuthLoginResult> {
  if (!getSharedAuthEnv() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      status: "unavailable",
      error: "Shared Supabase auth environment variables are not configured.",
    };
  }

  const aliases = buildAliases(params.tenantType, params.identity);
  if (aliases.length === 0) {
    return { status: "missing" };
  }

  const sharedUserId = await findSharedLoginUserId(params.tenantType, aliases);
  if (!sharedUserId) {
    return { status: "missing" };
  }

  return authenticateSharedAuthAccount(sharedUserId, params.password);
}

export async function syncScorePredictSharedPassword(params: {
  tenantType: TenantType;
  identity: ScorePredictLegacyIdentity;
  password: string;
}): Promise<SharedAuthPasswordSyncResult> {
  const result = await ensureScorePredictSharedIdentity({
    tenantType: params.tenantType,
    identity: params.identity,
    password: params.password,
  });

  const account = await findSharedAuthAccountById(result.sharedUserId);
  if (!isManagedScorePredictAuthAccount(account)) {
    return {
      sharedUserId: result.sharedUserId,
      passwordUpdated: false,
    };
  }

  const adminClient = getSharedAuthAdminClient();
  if (!adminClient) {
    throw new Error("Shared Supabase auth environment variables are not configured.");
  }

  const { error } = await adminClient.auth.admin.updateUserById(result.sharedUserId, {
    password: params.password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    sharedUserId: result.sharedUserId,
    passwordUpdated: true,
  };
}

export async function archiveScorePredictSharedIdentity(
  params: {
    tenantType: TenantType;
    identity: ScorePredictLegacyIdentity;
  },
  executor: SqlExecutor = prisma
) {
  const aliases = buildAliases(params.tenantType, params.identity);
  const sharedUserId = await findClaimedReservationUserIdWithExecutor(executor, params.tenantType, aliases);

  if (sharedUserId) {
    await executor.$executeRaw(Prisma.sql`
      update public.user_app_memberships
      set
        status = 'archived',
        updated_at = timezone('utc', now())
      where user_id = ${sharedUserId}::uuid
        and app_key = ${APP_KEY}
    `);

    await executor.$executeRaw(Prisma.sql`
      update public.user_division_memberships
      set
        status = 'archived',
        updated_at = timezone('utc', now())
      where user_id = ${sharedUserId}::uuid
        and app_key = ${APP_KEY}
        and division_slug = ${params.tenantType}
    `);
  }

  for (const alias of aliases) {
    if (sharedUserId && alias.appKey === APP_KEY) {
      await executor.$executeRaw(Prisma.sql`
        delete from public.user_login_aliases
        where user_id = ${sharedUserId}::uuid
          and app_key = ${alias.appKey}
          and alias_type = ${alias.aliasType}
          and alias_value = ${alias.aliasValue}
      `);
    }

    await executor.$executeRaw(Prisma.sql`
      update public.identity_claim_reservations
      set
        status = 'revoked',
        claimed_user_id = case
          when claimed_user_id = ${sharedUserId ?? null}::uuid then null
          else claimed_user_id
        end,
        updated_at = timezone('utc', now())
      where app_key = ${APP_KEY}
        and division_slug = ${params.tenantType}
        and alias_type = ${alias.aliasType}
        and alias_value = ${alias.aliasValue}
        and (claimed_user_id is null or claimed_user_id = ${sharedUserId ?? null}::uuid)
    `);
  }
}
