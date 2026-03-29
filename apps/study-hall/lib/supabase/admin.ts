import { createClient } from "@supabase/supabase-js";

type SupabaseAuthUser = {
  id: string;
  email: string | null;
};

function getSupabaseAdminEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin environment variables are not configured.");
  }

  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function listSupabaseUsersByIds(userIds: string[]) {
  const ids = new Set(userIds);

  if (ids.size === 0) {
    return new Map<string, SupabaseAuthUser>();
  }

  const supabase = createSupabaseAdminClient();
  const matched = new Map<string, SupabaseAuthUser>();
  let page = 1;

  while (page <= 10 && matched.size < ids.size) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(error.message);
    }

    for (const user of data.users) {
      if (!ids.has(user.id)) {
        continue;
      }

      matched.set(user.id, {
        id: user.id,
        email: user.email ?? null,
      });
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return matched;
}

export async function createSupabaseManagedUser(input: {
  email: string;
  password: string;
  name: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      name: input.name,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create Supabase user.");
  }

  return data.user;
}

export async function deleteSupabaseManagedUser(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateSupabaseManagedUserPassword(userId: string, password: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });

  if (error) {
    throw new Error(error.message);
  }
}
