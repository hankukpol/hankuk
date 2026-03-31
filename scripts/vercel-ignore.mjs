/**
 * Vercel ignoreCommand script (commit message trigger)
 *
 * - 커밋 메시지에 [deploy <app>] 포함 → 배포 (exit 1)
 * - 포함 안 됨 → 건너뛰기 (exit 0)
 *
 * 사용법:
 *   git commit -m "feat: 새 기능 [deploy score-predict]"
 *   git commit -m "fix: 공통 수정 [deploy score-predict] [deploy study-hall]"
 */
import { execSync } from "node:child_process";

const APP_NAME = process.argv[2];

if (!APP_NAME) {
  console.error("[vercel-ignore] App name argument is required.");
  process.exit(1);
}

const DEPLOY_TAG = `[deploy ${APP_NAME}]`;

console.log(`=== Vercel Ignore Check (${APP_NAME}) ===`);

try {
  const commitMessage = execSync("git log -1 --pretty=%B", {
    encoding: "utf-8",
  }).trim();
  console.log("Commit message:", commitMessage.split("\n")[0]);

  if (commitMessage.includes(DEPLOY_TAG)) {
    console.log(`\nFound ${DEPLOY_TAG} → BUILDING`);
    process.exit(1);
  } else {
    console.log(`\nNo ${DEPLOY_TAG} found → SKIPPING build`);
    process.exit(0);
  }
} catch (error) {
  console.log("Error:", error.message);
  console.log("Fallback: SKIPPING build");
  process.exit(0);
}
