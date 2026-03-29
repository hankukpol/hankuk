import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATHS = {
  "score-predict": ["apps/score-predict", "packages/config"],
  "study-hall": ["apps/study-hall"],
  "interview-pass": ["apps/interview-pass", "packages/config"],
};

const COMMON_PATHS = [
  ".nvmrc",
  ".vercelignore",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/vercel-ignore.mjs",
  "supabase",
  "turbo.json",
];

const appKey = process.argv[2];
const appPaths = APP_PATHS[appKey];

if (!appPaths) {
  console.error(`[vercel-ignore] Unknown app key: ${appKey ?? "<missing>"}`);
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

let baseCommit = "";

try {
  baseCommit = runGit(["rev-parse", "--verify", "HEAD^"]);
} catch {
  console.log(`[vercel-ignore] No parent commit detected for ${appKey}; continuing build.`);
  process.exit(1);
}

const changedFiles = runGit([
  "diff",
  "--name-only",
  baseCommit,
  "HEAD",
  "--",
  ...appPaths,
  ...COMMON_PATHS,
])
  .split(/\r?\n/)
  .filter(Boolean);

if (changedFiles.length === 0) {
  console.log(`[vercel-ignore] No relevant changes for ${appKey}; skipping build.`);
  process.exit(0);
}

console.log(`[vercel-ignore] Relevant changes found for ${appKey}:`);
for (const changedFile of changedFiles) {
  console.log(changedFile);
}

process.exit(1);
