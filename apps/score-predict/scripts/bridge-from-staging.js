"use strict";

const { PrismaClient } = require("@prisma/client");

const TENANTS = ["fire", "police"];
const TARGET_SCHEMA_BY_TENANT = {
  fire: "score_predict_fire",
  police: "score_predict_police",
};

const TABLES = [
  { sourceTable: "User", targetTable: "User", delegate: "user" },
  { sourceTable: "Exam", targetTable: "Exam", delegate: "exam" },
  { sourceTable: "Region", targetTable: "Region", delegate: "region" },
  { sourceTable: "Subject", targetTable: "Subject", delegate: "subject" },
  { sourceTable: "SiteSetting", targetTable: "SiteSetting", delegate: "siteSetting" },
  { sourceTable: "Notice", targetTable: "Notice", delegate: "notice", injectTenantType: true },
  { sourceTable: "Faq", targetTable: "Faq", delegate: "faq", injectTenantType: true },
  { sourceTable: "Banner", targetTable: "Banner", delegate: "banner", injectTenantType: true },
  { sourceTable: "EventSection", targetTable: "EventSection", delegate: "eventSection", injectTenantType: true },
  { sourceTable: "AuthRateLimitBucket", targetTable: "AuthRateLimitBucket", delegate: "authRateLimitBucket" },
  { sourceTable: "PasswordResetToken", targetTable: "PasswordResetToken", delegate: "passwordResetToken" },
  { sourceTable: "RecoveryCode", targetTable: "RecoveryCode", delegate: "recoveryCode" },
  { sourceTable: "AnswerKey", targetTable: "AnswerKey", delegate: "answerKey" },
  { sourceTable: "AnswerKeyLog", targetTable: "AnswerKeyLog", delegate: "answerKeyLog" },
  { sourceTable: "exam_region_quotas", targetTable: "exam_region_quotas", delegate: "examRegionQuota" },
  { sourceTable: "Submission", targetTable: "Submission", delegate: "submission" },
  { sourceTable: "PreRegistration", targetTable: "PreRegistration", delegate: "preRegistration" },
  { sourceTable: "visitor_logs", targetTable: "visitor_logs", delegate: "visitorLog" },
  { sourceTable: "Comment", targetTable: "Comment", delegate: "comment" },
  { sourceTable: "PassCutRelease", targetTable: "PassCutRelease", delegate: "passCutRelease" },
  { sourceTable: "RescoreEvent", targetTable: "RescoreEvent", delegate: "rescoreEvent" },
  { sourceTable: "SubmissionLog", targetTable: "SubmissionLog", delegate: "submissionLog" },
  { sourceTable: "UserAnswer", targetTable: "UserAnswer", delegate: "userAnswer" },
  { sourceTable: "SubjectScore", targetTable: "SubjectScore", delegate: "subjectScore" },
  { sourceTable: "DifficultyRating", targetTable: "DifficultyRating", delegate: "difficultyRating" },
  { sourceTable: "RescoreDetail", targetTable: "RescoreDetail", delegate: "rescoreDetail" },
  { sourceTable: "FinalPrediction", targetTable: "FinalPrediction", delegate: "finalPrediction" },
  { sourceTable: "PassCutSnapshot", targetTable: "PassCutSnapshot", delegate: "passCutSnapshot" },
];

const TRUNCATE_ORDER = [...TABLES].reverse();
const CONTENT_TABLES = new Set(["Notice", "Faq", "Banner", "EventSection"]);
const CHUNK_SIZE = 500;

function replaceSchemaInUrl(url, schema) {
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL is required.");
  }

  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function createClient(url, schema) {
  return new PrismaClient({
    datasources: {
      db: {
        url: replaceSchemaInUrl(url, schema),
      },
    },
    log: ["error"],
  });
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function normalizeRow(rowData, allowedColumns, tenantType, injectTenantType) {
  const prepared = {};

  for (const [key, value] of Object.entries(rowData ?? {})) {
    if (allowedColumns.has(key)) {
      prepared[key] = value;
    }
  }

  if (injectTenantType && allowedColumns.has("tenantType") && !prepared.tenantType) {
    prepared.tenantType = tenantType;
  }

  return prepared;
}

async function fetchTargetColumns(client, schema, table) {
  const rows = await client.$queryRawUnsafe(
    `
      select column_name
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
      order by ordinal_position
    `,
    schema,
    table
  );

  return new Set(rows.map((row) => row.column_name));
}

async function truncateTargetSchema(client, schema) {
  for (const table of TRUNCATE_ORDER) {
    await client.$executeRawUnsafe(`TRUNCATE TABLE "${schema}"."${table.targetTable}" RESTART IDENTITY CASCADE`);
  }
}

async function fetchSourceRows(stagingClient, tenantType, sourceTable) {
  const rows = await stagingClient.$queryRawUnsafe(
    `
      select row_data
      from score_predict.legacy_table_rows
      where tenant_type = $1
        and source_table = $2
      order by id asc
    `,
    tenantType,
    sourceTable
  );

  return rows.map((row) => row.row_data);
}

async function fetchSourceCount(stagingClient, tenantType, sourceTable) {
  const [row] = await stagingClient.$queryRawUnsafe(
    `
      select count(*)::int as count
      from score_predict.legacy_table_rows
      where tenant_type = $1
        and source_table = $2
    `,
    tenantType,
    sourceTable
  );

  return Number(row?.count ?? 0);
}

async function fetchTargetCount(targetClient, schema, table) {
  const [row] = await targetClient.$queryRawUnsafe(
    `select count(*)::int as count from "${schema}"."${table}"`,
  );

  return Number(row?.count ?? 0);
}

async function resetSequences(targetClient, schema) {
  for (const table of TABLES) {
    await targetClient.$executeRawUnsafe(
      `
        select setval(
          pg_get_serial_sequence('"${schema}"."${table.targetTable}"', 'id'),
          coalesce((select max("id") from "${schema}"."${table.targetTable}"), 0) + 1,
          false
        )
      `
    );
  }
}

async function copyTenant(stagingClient, tenantType) {
  const schema = TARGET_SCHEMA_BY_TENANT[tenantType];
  const targetClient = createClient(process.env.DIRECT_URL || process.env.DATABASE_URL, schema);

  try {
    console.log(`[${tenantType}] truncating ${schema}`);
    await truncateTargetSchema(targetClient, schema);

    for (const table of TABLES) {
      const sourceRows = await fetchSourceRows(stagingClient, tenantType, table.sourceTable);
      const allowedColumns = await fetchTargetColumns(targetClient, schema, table.targetTable);
      const preparedRows = sourceRows
        .map((rowData) =>
          normalizeRow(rowData, allowedColumns, tenantType, table.injectTenantType || CONTENT_TABLES.has(table.sourceTable))
        )
        .filter((rowData) => Object.keys(rowData).length > 0);

      if (preparedRows.length === 0) {
        const emptySourceCount = await fetchSourceCount(stagingClient, tenantType, table.sourceTable);
        console.log(`[${tenantType}] ${table.sourceTable}: source=${emptySourceCount}, target=0`);
        continue;
      }

      const delegate = targetClient[table.delegate];
      if (!delegate || typeof delegate.createMany !== "function") {
        throw new Error(`Delegate ${table.delegate}.createMany is not available.`);
      }

      for (const batch of chunk(preparedRows, CHUNK_SIZE)) {
        await delegate.createMany({
          data: batch,
        });
      }

      const sourceCount = await fetchSourceCount(stagingClient, tenantType, table.sourceTable);
      const targetCount = await fetchTargetCount(targetClient, schema, table.targetTable);
      if (sourceCount !== targetCount) {
        throw new Error(
          `[${tenantType}] row count mismatch for ${table.sourceTable}: source=${sourceCount}, target=${targetCount}`
        );
      }

      console.log(`[${tenantType}] ${table.sourceTable}: source=${sourceCount}, target=${targetCount}`);
    }

    await resetSequences(targetClient, schema);
    console.log(`[${tenantType}] sequence reset complete`);
  } finally {
    await targetClient.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const baseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const stagingClient = createClient(baseUrl, "score_predict");

  try {
    for (const tenantType of TENANTS) {
      await copyTenant(stagingClient, tenantType);
    }
  } finally {
    await stagingClient.$disconnect().catch(() => undefined);
  }
}

main()
  .then(() => {
    console.log("score-predict bridge copy completed");
  })
  .catch((error) => {
    console.error("score-predict bridge copy failed", error);
    process.exitCode = 1;
  });
