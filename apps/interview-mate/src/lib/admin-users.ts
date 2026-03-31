import { hashAdminPassword, verifyAdminPassword } from "@/lib/admin-password";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminRole = "super_admin" | "admin";

export type AdminUser = {
  id: string;
  loginId: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

type AdminUserRow = {
  id: string;
  login_id: string;
  display_name: string;
  password_hash: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

type CreateAdminUserInput = {
  loginId: string;
  displayName: string;
  password: string;
  role?: AdminRole;
  createdBy?: string | null;
};

const ADMIN_LOGIN_ID_REGEX = /^[a-z0-9._-]{4,32}$/;
const MIN_ADMIN_PASSWORD_LENGTH = 10;
const MAX_ADMIN_PASSWORD_LENGTH = 72;

export class AdminUserError extends Error {
  constructor(
    public readonly code:
      | "duplicate_login_id"
      | "invalid_login_id"
      | "invalid_password"
      | "invalid_display_name"
      | "create_failed",
    message: string,
  ) {
    super(message);
    this.name = "AdminUserError";
  }
}

function mapAdminUserRow(row: Omit<AdminUserRow, "password_hash">): AdminUser {
  return {
    id: row.id,
    loginId: row.login_id,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function normalizeAdminLoginId(loginId: string) {
  return loginId.trim().toLowerCase();
}

export function validateAdminLoginId(loginId: string) {
  const normalizedLoginId = normalizeAdminLoginId(loginId);

  if (!ADMIN_LOGIN_ID_REGEX.test(normalizedLoginId)) {
    throw new AdminUserError(
      "invalid_login_id",
      "관리자 아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈만 사용해 4~32자로 입력해주세요.",
    );
  }

  return normalizedLoginId;
}

export function validateAdminDisplayName(displayName: string, fallbackLoginId: string) {
  const normalizedDisplayName = displayName.trim() || fallbackLoginId;

  if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 40) {
    throw new AdminUserError(
      "invalid_display_name",
      "관리자 이름은 2~40자로 입력해주세요.",
    );
  }

  return normalizedDisplayName;
}

export function validateAdminPassword(password: string) {
  const normalizedPassword = password.trim();

  if (
    normalizedPassword.length < MIN_ADMIN_PASSWORD_LENGTH ||
    normalizedPassword.length > MAX_ADMIN_PASSWORD_LENGTH
  ) {
    throw new AdminUserError(
      "invalid_password",
      "관리자 비밀번호는 10~72자로 입력해주세요.",
    );
  }

  return normalizedPassword;
}

export async function hasActiveAdminUsers() {
  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) {
    throw new Error("관리자 계정 상태를 확인하지 못했습니다.");
  }

  return (count ?? 0) > 0;
}

export async function listAdminUsers() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select(
      "id, login_id, display_name, role, is_active, last_login_at, created_at, updated_at, created_by",
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("관리자 계정 목록을 불러오지 못했습니다.");
  }

  return (data ?? []).map((row) =>
    mapAdminUserRow(row as Omit<AdminUserRow, "password_hash">),
  );
}

export async function authenticateAdminUser(loginId: string, password: string) {
  const normalizedLoginId = normalizeAdminLoginId(loginId);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select(
      "id, login_id, display_name, password_hash, role, is_active, last_login_at, created_at, updated_at, created_by",
    )
    .eq("login_id", normalizedLoginId)
    .maybeSingle();

  if (error) {
    throw new Error("관리자 계정을 확인하지 못했습니다.");
  }

  const adminUser = data as AdminUserRow | null;

  if (!adminUser || !adminUser.is_active) {
    return null;
  }

  const isValidPassword = await verifyAdminPassword(password, adminUser.password_hash);

  if (!isValidPassword) {
    return null;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("admin_users")
    .update({ last_login_at: now, updated_at: now })
    .eq("id", adminUser.id);

  if (updateError) {
    throw new Error("관리자 로그인 시간을 갱신하지 못했습니다.");
  }

  return mapAdminUserRow({
    ...adminUser,
    last_login_at: now,
    updated_at: now,
  });
}

export async function createAdminUser({
  loginId,
  displayName,
  password,
  role = "admin",
  createdBy = null,
}: CreateAdminUserInput) {
  const normalizedLoginId = validateAdminLoginId(loginId);
  const normalizedDisplayName = validateAdminDisplayName(
    displayName,
    normalizedLoginId,
  );
  const normalizedPassword = validateAdminPassword(password);
  const passwordHash = await hashAdminPassword(normalizedPassword);
  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("admin_users")
    .insert({
      login_id: normalizedLoginId,
      display_name: normalizedDisplayName,
      password_hash: passwordHash,
      role,
      is_active: true,
      created_by: createdBy,
      updated_at: now,
    })
    .select(
      "id, login_id, display_name, role, is_active, last_login_at, created_at, updated_at, created_by",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AdminUserError(
        "duplicate_login_id",
        "이미 사용 중인 관리자 아이디입니다.",
      );
    }

    throw new AdminUserError(
      "create_failed",
      "관리자 계정을 생성하지 못했습니다.",
    );
  }

  return mapAdminUserRow(data as Omit<AdminUserRow, "password_hash">);
}
