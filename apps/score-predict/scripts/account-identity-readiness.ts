import { PrismaClient } from "@prisma/client";

const DEFAULT_SCHEMAS = ["score_predict_police", "score_predict_fire"] as const;

type CountRow = {
  total_users: bigint;
  blank_contact_phone: bigint;
  phone_fallback_contact: bigint;
  missing_recovery_contact: bigint;
  missing_recovery_email: bigint;
};

type DuplicateRow = {
  duplicate_groups: bigint;
  affected_users: bigint;
};

type AliasRow = {
  username_alias_users: bigint;
  contact_alias_users: bigint;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function databaseUrlForSchema(rawUrl: string, schema: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}

function numberRecord<T extends Record<string, bigint>>(row: T) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

async function auditSchema(rawUrl: string, schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: databaseUrlForSchema(rawUrl, schema) } },
    log: ["error"],
  });
  try {
    const [counts] = await db.$queryRaw<CountRow[]>`
      SELECT
        count(*)::bigint AS total_users,
        count(*) FILTER (WHERE coalesce("contactPhone", '') = '')::bigint AS blank_contact_phone,
        count(*) FILTER (
          WHERE coalesce("contactPhone", '') = ''
            AND regexp_replace("phone", '[^0-9]', '', 'g') ~ '^01(0|1|6|7|8|9)[0-9]{7,8}$'
        )::bigint AS phone_fallback_contact,
        count(*) FILTER (
          WHERE coalesce("contactPhone", '') = ''
            AND regexp_replace("phone", '[^0-9]', '', 'g') !~ '^01(0|1|6|7|8|9)[0-9]{7,8}$'
        )::bigint AS missing_recovery_contact,
        count(*) FILTER (WHERE "email" IS NULL OR btrim("email") = '')::bigint AS missing_recovery_email
      FROM "User"
    `;
    const [usernameDuplicates] = await db.$queryRaw<DuplicateRow[]>`
      SELECT count(*)::bigint AS duplicate_groups, coalesce(sum(group_count), 0)::bigint AS affected_users
      FROM (
        SELECT count(*)::bigint AS group_count
        FROM "User"
        GROUP BY lower("phone")
        HAVING count(*) > 1
      ) duplicate_usernames
    `;
    const [contactDuplicates] = await db.$queryRaw<DuplicateRow[]>`
      SELECT count(*)::bigint AS duplicate_groups, coalesce(sum(group_count), 0)::bigint AS affected_users
      FROM (
        SELECT count(*)::bigint AS group_count
        FROM "User"
        WHERE regexp_replace(coalesce("contactPhone", ''), '[^0-9]', '', 'g') <> ''
        GROUP BY regexp_replace("contactPhone", '[^0-9]', '', 'g')
        HAVING count(*) > 1
      ) duplicate_contacts
    `;
    const [emailDuplicates] = await db.$queryRaw<DuplicateRow[]>`
      SELECT count(*)::bigint AS duplicate_groups, coalesce(sum(group_count), 0)::bigint AS affected_users
      FROM (
        SELECT count(*)::bigint AS group_count
        FROM "User"
        WHERE "email" IS NOT NULL AND btrim("email") <> ''
        GROUP BY lower("email")
        HAVING count(*) > 1
      ) duplicate_emails
    `;
    const [aliasTable] = await db.$queryRaw<Array<{ table_name: string | null }>>`
      SELECT to_regclass('"LegacyAccountIdentity"')::text AS table_name
    `;
    const aliases = aliasTable?.table_name
      ? (
          await db.$queryRaw<AliasRow[]>`
            SELECT
              count(DISTINCT "userId") FILTER (WHERE "kind" = 'USERNAME')::bigint AS username_alias_users,
              count(DISTINCT "userId") FILTER (WHERE "kind" = 'CONTACT_PHONE')::bigint AS contact_alias_users
            FROM "LegacyAccountIdentity"
          `
        )[0]
      : { username_alias_users: BigInt(0), contact_alias_users: BigInt(0) };

    const blockers = {
      usernames: numberRecord(usernameDuplicates),
      contacts: numberRecord(contactDuplicates),
      emails: numberRecord(emailDuplicates),
    };
    return {
      schema,
      counts: numberRecord(counts),
      duplicateBlockers: blockers,
      preservedLegacyIdentityUsers: numberRecord(aliases),
      identityMigrationsReady: blockers.emails.duplicate_groups === 0,
      plannedSafeRemediation: {
        usernameGroups: blockers.usernames.duplicate_groups,
        contactGroups: blockers.contacts.duplicate_groups,
        deletesOrMergesUsers: false,
      },
    };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const rawUrl = process.env.DATABASE_URL?.trim();
  assert(rawUrl, "DATABASE_URL is required. This command only reads the selected database.");
  const requestedSchemas = process.argv
    .slice(2)
    .filter((argument) => argument.startsWith("--schema="))
    .map((argument) => argument.slice("--schema=".length).trim())
    .filter(Boolean);
  const schemas = requestedSchemas.length > 0 ? requestedSchemas : [...DEFAULT_SCHEMAS];
  const reports = [];
  for (const schema of schemas) {
    reports.push(await auditSchema(rawUrl, schema));
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
  if (reports.some((report) => !report.identityMigrationsReady)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
