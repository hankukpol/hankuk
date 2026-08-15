import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import {
  findPoliceUsersByContactPhone,
  findPoliceUsersByUsername,
} from "@/lib/police/account-identity";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowedHosts = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
const allowedPorts = new Set(["5432", "54332"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function withSchema(rawUrl: string, schema: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function runMigration(databaseUrl: string, migrationName: string) {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const args = [
    "exec",
    "prisma",
    "db",
    "execute",
    "--file",
    `prisma/migrations/${migrationName}/migration.sql`,
    "--schema",
    "prisma/schema.prisma",
  ];
  const result = spawnSync(executable, args, {
    cwd: appDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  assert(
    result.status === 0,
    `${migrationName} failed: ${result.stderr || result.stdout}`
  );
}

async function main() {
  const rawUrl =
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54332/postgres";
  const parsed = new URL(rawUrl);
  assert(
    allowedHosts.has(parsed.hostname) && allowedPorts.has(parsed.port),
    `Local database required. Received ${parsed.hostname}:${parsed.port}.`
  );

  const schema = `identity_conflict_test_${randomBytes(6).toString("hex")}`;
  assert(/^identity_conflict_test_[a-f0-9]{12}$/.test(schema), "Unsafe test schema name.");
  const baseUrl = withSchema(rawUrl, "public");
  const testUrl = withSchema(rawUrl, schema);
  const baseDb = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  let testDb: PrismaClient | null = null;

  try {
    await baseDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    testDb = new PrismaClient({ datasources: { db: { url: testUrl } } });
    await testDb.$executeRawUnsafe(
      `CREATE TYPE "AccountRecoveryPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION')`
    );
    await testDb.$executeRawUnsafe(`CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN')`);
    await testDb.$executeRawUnsafe(`
      CREATE TABLE "User" (
        "id" INTEGER PRIMARY KEY,
        "name" TEXT NOT NULL DEFAULT 'fixture',
        "email" TEXT,
        "emailVerifiedAt" TIMESTAMP(3),
        "phone" TEXT NOT NULL UNIQUE,
        "contactPhone" TEXT NOT NULL DEFAULT '',
        "password" TEXT NOT NULL DEFAULT 'fixture-hash',
        "role" "Role" NOT NULL DEFAULT 'USER',
        "credentialVersion" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await testDb.$executeRawUnsafe(`
      CREATE TABLE "MemberRecord" (
        "id" INTEGER PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
        "payload" TEXT NOT NULL
      )
    `);
    await testDb.$executeRawUnsafe(`
      INSERT INTO "User" ("id", "phone", "contactPhone", "createdAt") VALUES
        (1, 'CaseMember', '01070000001', '2025-01-01T00:00:00Z'),
        (2, 'casemember', '01070000002', '2025-02-01T00:00:00Z'),
        (3, 'contactmembera', '010-7111-2222', '2025-01-01T00:00:00Z'),
        (4, 'contactmemberb', '01071112222', '2025-02-01T00:00:00Z')
    `);
    await testDb.$executeRawUnsafe(`
      INSERT INTO "MemberRecord" ("id", "userId", "payload") VALUES
        (1, 1, 'record-a'), (2, 2, 'record-b'), (3, 3, 'record-c'), (4, 4, 'record-d')
    `);

    const preMigrationUsernameMatches = await findPoliceUsersByUsername("CASEMEMBER", testDb);
    const preMigrationContactMatches = await findPoliceUsersByContactPhone("01071112222", testDb);
    assert(
      preMigrationUsernameMatches.length === 2 && preMigrationContactMatches.length === 2,
      "Alias-aware app fallback failed before the alias table exists."
    );

    runMigration(testUrl, "20260815_account_identity_aliases");
    runMigration(testUrl, "20260815_account_identity_aliases");
    runMigration(testUrl, "20260815_case_insensitive_credentials_and_account_lookup");

    const [counts] = await testDb.$queryRaw<
      Array<{ users: bigint; member_records: bigint; aliases: bigint }>
    >`
      SELECT
        (SELECT count(*) FROM "User")::bigint AS users,
        (SELECT count(*) FROM "MemberRecord")::bigint AS member_records,
        (SELECT count(*) FROM "LegacyAccountIdentity")::bigint AS aliases
    `;
    const duplicateUsernames = await testDb.$queryRaw<Array<{ normalized: string }>>`
      SELECT lower("phone") AS normalized
      FROM "User"
      GROUP BY lower("phone")
      HAVING count(*) > 1
    `;
    const duplicateContacts = await testDb.$queryRaw<Array<{ normalized: string }>>`
      SELECT regexp_replace("contactPhone", '[^0-9]', '', 'g') AS normalized
      FROM "User"
      WHERE "contactPhone" <> ''
      GROUP BY regexp_replace("contactPhone", '[^0-9]', '', 'g')
      HAVING count(*) > 1
    `;
    const aliases = await testDb.$queryRaw<
      Array<{ userId: number; kind: string; value: string; normalizedValue: string }>
    >`
      SELECT "userId", "kind", "value", "normalizedValue"
      FROM "LegacyAccountIdentity"
      ORDER BY "userId", "kind"
    `;
    const users = await testDb.$queryRaw<
      Array<{ id: number; phone: string; contactPhone: string }>
    >`SELECT "id", "phone", "contactPhone" FROM "User" ORDER BY "id"`;
    const postMigrationUsernameMatches = await findPoliceUsersByUsername("CASEMEMBER", testDb);
    const postMigrationContactMatches = await findPoliceUsersByContactPhone("01071112222", testDb);

    assert(Number(counts?.users) === 4, "A user row was lost during remediation.");
    assert(Number(counts?.member_records) === 4, "A related member record was lost.");
    assert(Number(counts?.aliases) === 4, "Legacy identity aliases were not idempotent.");
    assert(duplicateUsernames.length === 0, "Case-insensitive username duplicates remain.");
    assert(duplicateContacts.length === 0, "Normalized contact duplicates remain.");
    assert(
      postMigrationUsernameMatches.length === 2 && postMigrationContactMatches.length === 2,
      "Preserved aliases were not resolved after migration."
    );
    assert(users.map((user) => user.id).join(",") === "1,2,3,4", "User IDs changed.");
    assert(users[0]?.phone === "casemember", "Oldest username owner was not retained.");
    assert(/^legacy2x*$/.test(users[1]?.phone ?? ""), "Secondary username was not safely remapped.");
    assert(users[2]?.contactPhone === "01071112222", "Oldest contact owner was not retained.");
    assert(users[3]?.contactPhone === "", "Secondary duplicate contact was not isolated.");
    assert(
      aliases.some(
        (identity) =>
          identity.userId === 1 && identity.kind === "USERNAME" && identity.value === "CaseMember"
      ) &&
        aliases.some(
          (identity) =>
            identity.userId === 2 && identity.kind === "USERNAME" && identity.value === "casemember"
        ),
      "Original username casing was not preserved."
    );
    assert(
      aliases.filter(
        (identity) =>
          identity.kind === "CONTACT_PHONE" && identity.normalizedValue === "01071112222"
      ).length === 2,
      "Duplicate contact ownership history was not preserved."
    );

    console.log(
      JSON.stringify(
        {
          usersPreserved: Number(counts.users),
          relatedRecordsPreserved: Number(counts.member_records),
          aliasesPreserved: Number(counts.aliases),
          remainingUsernameDuplicateGroups: duplicateUsernames.length,
          remainingContactDuplicateGroups: duplicateContacts.length,
          idempotentReplay: true,
          appFallbackBeforeMigration: true,
          aliasResolutionAfterMigration: true,
        },
        null,
        2
      )
    );
  } finally {
    if (testDb) await testDb.$disconnect();
    await baseDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await baseDb.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
