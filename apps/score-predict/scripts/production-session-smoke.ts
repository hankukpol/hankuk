import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import { encode } from "next-auth/jwt";

type TenantType = "police" | "fire";

const productionRef = "pbonwjwbtqyrfrxqdwlu";
const origins: Record<TenantType, string> = {
  police: "https://fullservice.hankukpol.co.kr",
  fire: "https://fullservice.119sobang.co.kr",
};
const schemas: Record<TenantType, string> = {
  police: "score_predict_police",
  fire: "score_predict_fire",
};
const appDir = resolve(process.cwd());
const envPath = resolve(appDir, ".env.production.audit.local");
const evidenceDir = resolve(
  appDir,
  ".superloopy/evidence/deployment/20260807-score-predict-tenant-split"
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseEnvFile() {
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    let value = line.slice(separator + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\n", "\n").replaceAll("\\\\", "\\");
    }
    values[key] = value;
  }
  return values;
}

function databaseUrlForSchema(rawUrl: string, schema: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}

async function findAdminId(tenantType: TenantType, databaseUrl: string) {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrlForSchema(databaseUrl, schemas[tenantType]) } },
  });
  try {
    const admin = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
      orderBy: { id: "asc" },
      select: { id: true, credentialVersion: true },
    });
    assert(admin, `${tenantType}: no Production admin exists for a read-only session smoke test.`);
    return admin;
  } finally {
    await prisma.$disconnect();
  }
}

async function buildSessionCookie(secret: string, tenantType: TenantType, adminId: number, credentialVersion: number) {
  const token = await encode({
    secret,
    maxAge: 5 * 60,
    token: {
      sub: String(adminId),
      id: String(adminId),
      name: "deployment-smoke",
      role: "ADMIN",
      tenantType,
      sessionVersion: 3,
      credentialVersion,
    },
  });
  return `__Secure-next-auth.session-token=${token}`;
}

async function verifyTenant(tenantType: TenantType, cookie: string) {
  const origin = origins[tenantType];
  const opposite = tenantType === "police" ? "fire" : "police";
  const headers = { cookie };
  const sessionResponse = await fetch(`${origin}/api/auth/session`, { headers });
  assert(sessionResponse.status === 200, `${tenantType}: Production tenant session returned ${sessionResponse.status}.`);
  const session = await sessionResponse.json() as { user?: { tenantType?: string; sessionVersion?: number; role?: string } };
  assert(session.user?.tenantType === tenantType && session.user.sessionVersion === 3 && session.user.role === "ADMIN", `${tenantType}: Production session claims are invalid.`);

  const statsResponse = await fetch(`${origin}/api/main-stats`, { headers });
  assert(
    statsResponse.status === 200 || statsResponse.status === 403,
    `${tenantType}: authenticated Production main stats returned ${statsResponse.status}.`
  );
  const stats = await statsResponse.json() as {
    tenantType?: string;
    examTypes?: Array<{ key: string }>;
    scoreDistributions?: Record<string, Array<{ label: string; maxScore: number }>>;
    error?: string;
  };
  if (statsResponse.status === 403) {
    assert(Boolean(stats.error), `${tenantType}: operation-stage stats denial did not include an error message.`);
  } else {
    assert(stats.tenantType === tenantType, `${tenantType}: authenticated Production stats tenant mismatch.`);
  }
  const examTypes = new Set(stats.examTypes?.map((item) => item.key) ?? []);
  const publicDistribution = stats.scoreDistributions?.PUBLIC ?? [];
  const labels = new Set(publicDistribution.map((item) => item.label));
  if (statsResponse.status === 200 && tenantType === "police") {
    const allowedPoliceExamTypes = new Set(["PUBLIC", "CAREER"]);
    assert(
      examTypes.has("PUBLIC") && [...examTypes].every((examType) => allowedPoliceExamTypes.has(examType)),
      `Police Production exam types are mixed: ${JSON.stringify([...examTypes])}`
    );
    assert(
      labels.size === 0 || (labels.has("헌법") && labels.has("형사법") && labels.has("경찰학") && !labels.has("소방학개론")),
      `Police Production subjects are mixed: ${JSON.stringify(publicDistribution)}`
    );
    assert(
      publicDistribution.length === 0 || publicDistribution.find((item) => item.label === "총점")?.maxScore === 250,
      "Police Production total max score is not 250."
    );
  } else if (statsResponse.status === 200) {
    const allowedFireExamTypes = new Set(["PUBLIC", "CAREER_RESCUE", "CAREER_ACADEMIC", "CAREER_EMT"]);
    assert(
      examTypes.has("PUBLIC") && [...examTypes].every((examType) => allowedFireExamTypes.has(examType)),
      `Fire Production exam types are mixed: ${JSON.stringify([...examTypes])}`
    );
    assert(
      labels.size === 0 || (labels.has("소방학개론") && labels.has("소방관계법규") && !labels.has("헌법")),
      `Fire Production subjects are mixed: ${JSON.stringify(publicDistribution)}`
    );
    assert(
      publicDistribution.length === 0 || publicDistribution.find((item) => item.label === "총점")?.maxScore === 300,
      "Fire Production total max score is not 300."
    );
  }

  const adminResponse = await fetch(`${origin}/api/admin/users`, { headers });
  assert(adminResponse.status === 200, `${tenantType}: authenticated Production admin API returned ${adminResponse.status}.`);
  const crossedResponse = await fetch(`${origins[opposite]}/api/admin/users`, { headers });
  assert(crossedResponse.status === 401, `${tenantType}: crossed Production admin session expected 401, received ${crossedResponse.status}.`);

  return {
    origin,
    session: sessionResponse.status,
    mainStats: statsResponse.status,
    adminUsers: adminResponse.status,
    crossedAdmin: crossedResponse.status,
    examTypes: [...examTypes],
    publicDistribution: publicDistribution.map((item) => ({ label: item.label, maxScore: item.maxScore })),
  };
}

async function main() {
  assert(process.env.PRODUCTION_SESSION_SMOKE_CONFIRM === "READ_ONLY_SCORE_PREDICT_PRODUCTION_SESSION", "Production session smoke confirmation is missing.");
  const values = parseEnvFile();
  const databaseUrl = values.DATABASE_URL;
  const secret = values.NEXTAUTH_SECRET;
  assert(databaseUrl?.includes(productionRef) && !databaseUrl.includes("ftzcmuvunhbwetzdwyfy"), "Production session smoke database validation failed.");
  assert(secret?.length >= 32, "Production NEXTAUTH_SECRET is missing or too short.");

  const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), mode: "read-only signed session" };
  for (const tenantType of ["police", "fire"] as const) {
    const admin = await findAdminId(tenantType, databaseUrl);
    const cookie = await buildSessionCookie(secret, tenantType, admin.id, admin.credentialVersion);
    report[tenantType] = await verifyTenant(tenantType, cookie);
  }
  mkdirSync(evidenceDir, { recursive: true });
  const reportPath = resolve(evidenceDir, "production-session-smoke.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ result: "passed", evidence: reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
