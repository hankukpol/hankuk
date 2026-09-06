/**
 * Vercel ignoreCommand script (commit message trigger)
 *
 * - 커밋 메시지에 [deploy <app>] 포함 → 배포 (exit 1)
 * - 포함 안 됨 → 건너뛰기 (exit 0)
 *
 * 사용법:
 *   git commit -m "feat: 새 기능 [deploy score-predict]"
 *   git commit -m "fix: 공통 수정 [deploy score-predict] [deploy study-hall]"
 *
 * 커밋 메시지는 Vercel이 넣어주는 VERCEL_GIT_COMMIT_MESSAGE로 읽는다.
 * .vercelignore가 .git을 지운 뒤 이 스크립트가 실행되므로 git 명령은 쓸 수 없다.
 * git으로 읽던 시절에는 매번 실패해 조용히 건너뛰었고, 그래서 class-pass 배포가
 * 몇 달 동안 나가지 않은 채 아무도 알아채지 못했다.
 */
import { execSync } from "node:child_process";

const APP_NAME = process.argv[2];

if (!APP_NAME) {
  console.error("[vercel-ignore] App name argument is required.");
  process.exit(1);
}

const DEPLOY_TAG = `[deploy ${APP_NAME}]`;

console.log(`=== Vercel Ignore Check (${APP_NAME}) ===`);

/** 커밋 메시지를 구하지 못하면 null. 배포 여부는 호출부가 정한다. */
function readCommitMessage() {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  if (fromEnv && fromEnv.trim()) {
    console.log("Source: VERCEL_GIT_COMMIT_MESSAGE");
    return fromEnv.trim();
  }

  // 로컬에서 이 스크립트를 직접 돌려볼 때를 위한 보조 경로.
  try {
    const fromGit = execSync("git log -1 --pretty=%B", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (fromGit) {
      console.log("Source: git log");
      return fromGit;
    }
  } catch {
    // Vercel 빌드 컨테이너에는 .git이 없다. 예상된 실패다.
  }

  return null;
}

const commitMessage = readCommitMessage();

if (commitMessage === null) {
  // 판단할 근거가 없으면 빌드한다. 놓친 배포는 조용히 묻히지만
  // 불필요한 빌드는 로그에 남고 되돌리기도 쉽다.
  console.log("\nCommit message unavailable → BUILDING (fail-safe)");
  process.exit(1);
}

console.log("Commit message:", commitMessage.split("\n")[0]);

if (commitMessage.includes(DEPLOY_TAG)) {
  console.log(`\nFound ${DEPLOY_TAG} → BUILDING`);
  process.exit(1);
}

console.log(`\nNo ${DEPLOY_TAG} found → SKIPPING build`);
process.exit(0);
