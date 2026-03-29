import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(webRoot, relativePath), "utf8");
}

function exists(relativePath) {
  const fullPath = path.join(webRoot, relativePath);
  return fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0;
}

const packageJson = JSON.parse(read("package.json"));
assert(packageJson.dependencies?.["next-pwa"], "next-pwa dependency is missing.");

const nextConfig = read("next.config.mjs");
assert(nextConfig.includes("nextPwa"), "next.config.mjs must wrap config with next-pwa.");
assert(nextConfig.includes('customWorkerDir: "worker"'), "next.config.mjs must declare the custom worker directory.");
assert(nextConfig.includes("cacheStartUrl: false"), "PWA start URL cache must be disabled.");
assert(nextConfig.includes("dynamicStartUrl: false"), "Dynamic start URL cache must be disabled.");
assert(!nextConfig.includes("/api/student"), "Student API caching must not be configured in next-pwa.");
assert(!nextConfig.includes("/student/.*"), "Student HTML caching pattern must not be configured in next-pwa.");

const manifest = JSON.parse(read(path.join("public", "manifest.json")));
assert(manifest.start_url === "/student", "manifest start_url must point to /student.");
assert(manifest.scope === "/student", "manifest scope must be /student.");
assert(manifest.display === "standalone", "manifest display must be standalone.");
assert(
  manifest.name === "학원 통합 운영 시스템 학생 포털",
  "manifest name must use the academy-ops portal brand.",
);

const iconSources = new Set((manifest.icons ?? []).map((icon) => icon.src));
for (const iconPath of [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
]) {
  assert(iconSources.has(iconPath), `manifest is missing ${iconPath}.`);
}

for (const iconFile of [
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/maskable-512.png",
  "public/icons/apple-touch-icon.png",
  "public/icons/badge-72.png",
]) {
  assert(exists(iconFile), `${iconFile} is missing or empty.`);
}

const rootLayout = read(path.join("src", "app", "layout.tsx"));
assert(
  rootLayout.includes("export async function generateMetadata"),
  "Root layout must generate metadata dynamically.",
);
assert(
  rootLayout.includes("export async function generateViewport"),
  "Root layout must generate viewport dynamically.",
);
assert(
  rootLayout.includes("getAcademyRuntimeBranding"),
  "Root layout must resolve academy runtime branding.",
);
assert(rootLayout.includes('manifest: "/manifest.json"'), "Root metadata must expose manifest.");

const studentLayout = read(path.join("src", "app", "student", "layout.tsx"));
assert(studentLayout.includes("max-w-md"), "Student layout must keep a mobile-first max width.");
assert(studentLayout.includes("StudentBottomNav"), "Student layout must render the bottom nav.");
assert(studentLayout.includes("StudentLogoutButton"), "Student layout must expose logout action.");
assert(
  studentLayout.includes("getAcademyRuntimeBranding"),
  "Student layout must resolve academy runtime branding.",
);

assert(exists(path.join("src", "worker", "index.js")), "Custom worker source is missing.");

const builtServiceWorkerPath = path.join(webRoot, "public", "sw.js");
assert(
  fs.existsSync(builtServiceWorkerPath),
  "Built service worker is missing. Run `pnpm --dir ./apps/academy-ops build` before verify:student-pwa.",
);

const builtServiceWorker = fs.readFileSync(builtServiceWorkerPath, "utf8");
const workerScriptMatch = builtServiceWorker.match(/worker-[^"']+\.js/);
assert(workerScriptMatch, "Built service worker must reference the custom worker bundle.");
assert(
  exists(path.join("public", workerScriptMatch[0])),
  "Custom worker bundle referenced by sw.js is missing.",
);

console.log("verify:student-pwa ok");
