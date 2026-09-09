import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? (entry.name === "integration" ? [] : collect(file)) : /\.test\.ts$/.test(entry.name) ? [file] : [];
  });
}
const files = collect("tests").sort();

// 개발용 .local/mock-db.json 과 분리한다. 같이 쓰면 테스트가 시연 데이터를 초기화한다.
const mockDbDir = path.join("tests", ".mock-db");
rmSync(mockDbDir, { recursive: true, force: true });
mkdirSync(mockDbDir, { recursive: true });

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=4", ...files], {
  stdio: "inherit",
  env: { ...process.env, MOCK_MODE: "true", MOCK_DB_DIR: path.resolve(mockDbDir), DATABASE_URL: "postgresql://test:test@127.0.0.1:9/test", DIRECT_URL: "postgresql://test:test@127.0.0.1:9/test" },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
