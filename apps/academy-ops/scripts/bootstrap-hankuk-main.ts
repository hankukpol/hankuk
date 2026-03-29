import { AcademyType, AdminRole, PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

type AuthUser = {
  id: string;
  email: string | null;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function getOptionalEnv(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

async function findAuthUserByEmail(
  supabase: any,
  email: string,
): Promise<AuthUser | null> {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const found = data.users.find(
      (user: { id: string; email?: string | null }) =>
        user.email?.toLowerCase() === email.toLowerCase(),
    );

    if (found) {
      return {
        id: found.id,
        email: found.email ?? null,
      };
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}

async function ensureAuthUser(
  supabase: any,
  email: string,
  password: string,
  name: string,
) {
  const existing = await findAuthUserByEmail(supabase, email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(
      existing.id,
      {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: name,
          source: "academy-ops-bootstrap",
        },
      },
    );

    if (error) {
      throw error;
    }

    return {
      id: data.user?.id ?? existing.id,
      email: data.user?.email ?? existing.email,
    };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: name,
      source: "academy-ops-bootstrap",
    },
  });

  if (error || !data.user) {
    throw error ?? new Error("Failed to create Supabase auth user.");
  }

  return {
    id: data.user.id,
    email: data.user.email ?? email,
  };
}

async function main() {
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const superAdminEmail = getRequiredEnv("SEED_SUPER_ADMIN_EMAIL").toLowerCase();
  const superAdminPassword = getRequiredEnv("SEED_SUPER_ADMIN_PASSWORD");
  const superAdminName = getOptionalEnv(
    "SEED_SUPER_ADMIN_NAME",
    "한국경찰학원 최고관리자",
  );
  const superAdminPhone = getOptionalEnv("SEED_SUPER_ADMIN_PHONE") || null;
  const academyCode = getOptionalEnv("SEED_ACADEMY_CODE", "hankuk-main");
  const academyName = getOptionalEnv("SEED_ACADEMY_NAME", "한국경찰학원");
  const academyHostname =
    getOptionalEnv("SEED_ACADEMY_HOSTNAME", "academy-ops.vercel.app") || null;
  const academyThemeColor = getOptionalEnv(
    "SEED_ACADEMY_THEME_COLOR",
    "#C55A11",
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const authUser = await ensureAuthUser(
    supabase,
    superAdminEmail,
    superAdminPassword,
    superAdminName,
  );

  const academy = await prisma.academy.upsert({
    where: { code: academyCode },
    update: {
      name: academyName,
      type: AcademyType.POLICE,
      hostname: academyHostname,
      themeColor: academyThemeColor,
      isActive: true,
    },
    create: {
      code: academyCode,
      name: academyName,
      type: AcademyType.POLICE,
      hostname: academyHostname,
      themeColor: academyThemeColor,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      hostname: true,
    },
  });

  await prisma.systemConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      data: {},
    },
  });

  await prisma.academySettings.upsert({
    where: { academyId: academy.id },
    update: {
      name: academyName,
    },
    create: {
      academyId: academy.id,
      name: academyName,
    },
  });

  await prisma.adminUser.upsert({
    where: { id: authUser.id },
    update: {
      email: superAdminEmail,
      name: superAdminName,
      phone: superAdminPhone,
      role: AdminRole.SUPER_ADMIN,
      academyId: null,
      isActive: true,
    },
    create: {
      id: authUser.id,
      email: superAdminEmail,
      name: superAdminName,
      phone: superAdminPhone,
      role: AdminRole.SUPER_ADMIN,
      academyId: null,
      isActive: true,
    },
  });

  await prisma.$executeRaw`
    insert into public.user_profiles (id, full_name, phone, default_app)
    values (cast(${authUser.id} as uuid), ${superAdminName}, ${superAdminPhone}, ${"academy-ops"})
    on conflict (id) do update
    set
      full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
      phone = coalesce(public.user_profiles.phone, excluded.phone),
      default_app = coalesce(public.user_profiles.default_app, excluded.default_app),
      updated_at = timezone('utc', now())
  `;

  await prisma.$executeRaw`
    insert into public.user_app_memberships (user_id, app_key, role_key, status)
    values (cast(${authUser.id} as uuid), ${"academy-ops"}, ${"super_admin"}, ${"active"})
    on conflict (user_id, app_key, role_key) do update
    set
      status = 'active',
      updated_at = timezone('utc', now())
  `;

  await prisma.$executeRaw`
    insert into public.user_login_aliases (user_id, app_key, alias_type, alias_value, is_primary, is_verified)
    values (cast(${authUser.id} as uuid), null, ${"email"}, ${superAdminEmail}, true, true)
    on conflict do nothing
  `;

  console.log(
    JSON.stringify(
      {
        academyId: academy.id,
        academyCode: academy.code,
        academyName: academy.name,
        academyHostname: academy.hostname,
        superAdminId: authUser.id,
        superAdminEmail,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[bootstrap:hankuk-main] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
