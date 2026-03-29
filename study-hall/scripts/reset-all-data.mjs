import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function loadEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename);

  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const mockDirectory = path.resolve(process.cwd(), ".local");
const mockStatePath = path.resolve(mockDirectory, "mock-db.json");
const mockStateBackupPath = path.resolve(mockDirectory, "mock-db.backup.json");

if (!process.argv.includes("--force")) {
  console.error("[reset-all-data] --force 옵션이 필요합니다.");
  process.exit(1);
}

if (process.env.MOCK_MODE === "true") {
  const removedPaths = [mockStatePath, mockStateBackupPath].filter((targetPath) =>
    fs.existsSync(targetPath),
  );

  for (const targetPath of removedPaths) {
    fs.unlinkSync(targetPath);
  }

  if (removedPaths.length > 0) {
    console.log("[reset-all-data] mock 저장소를 초기 상태로 되돌렸습니다.");
  } else {
    console.log("[reset-all-data] 초기화할 mock 저장소가 없습니다.");
  }
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[reset-all-data] DATABASE_URL이 설정되어 있지 않습니다.");
  process.exit(1);
}

// 프로덕션 DB 보호: supabase.co 등 원격 DB URL 감지 시 차단
const dbUrl = process.env.DATABASE_URL;
const productionPatterns = [
  "supabase.co",
  "neon.tech",
  "planetscale.com",
  "amazonaws.com",
  "azure.com",
];
const isProductionDb = productionPatterns.some((pattern) => dbUrl.includes(pattern));

if (isProductionDb) {
  console.error("[reset-all-data] 프로덕션 데이터베이스가 감지되었습니다.");
  console.error(`  DATABASE_URL: ${dbUrl.slice(0, 40)}...`);
  console.error("  프로덕션 DB 초기화는 차단됩니다. 로컬 DB에서만 실행해 주세요.");

  if (!process.argv.includes("--i-know-what-i-am-doing")) {
    process.exit(1);
  }

  console.warn(
    "[reset-all-data] --i-know-what-i-am-doing 플래그가 감지되었습니다. 프로덕션 보호를 우회합니다.",
  );
}

const { PrismaClient } = await import("@prisma/client/index.js");

const prisma = new PrismaClient();

try {
  await prisma.$transaction([
    prisma.announcement.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.pointRecord.deleteMany(),
    prisma.leavePermission.deleteMany(),
    prisma.interview.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentCategory.deleteMany(),
    prisma.scoreTarget.deleteMany(),
    prisma.examScore.deleteMany(),
    prisma.examSubject.deleteMany(),
    prisma.examType.deleteMany(),
    prisma.pointRule.deleteMany(),
    prisma.student.deleteMany(),
    prisma.period.deleteMany(),
    prisma.seat.deleteMany(),
    prisma.studyRoom.deleteMany(),
    prisma.tuitionPlan.deleteMany(),
    prisma.divisionSettings.deleteMany(),
    prisma.admin.deleteMany(),
    prisma.division.deleteMany(),
  ]);

  console.log("[reset-all-data] 모든 데이터가 초기화되었습니다.");
} catch (error) {
  console.error("[reset-all-data] 초기화 중 오류가 발생했습니다.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
