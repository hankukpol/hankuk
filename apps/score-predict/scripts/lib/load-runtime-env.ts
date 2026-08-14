import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vercel에서 내려받은 감사용 환경 파일을 DB 운영 스크립트에만 주입한다.
 * 파일 내용과 비밀값은 출력하지 않으며 이미 설정된 셸 환경변수를 덮어쓰지 않는다.
 */
export function loadRuntimeEnvFile(fileName = ".env.production.audit.local") {
  const envPath = resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) return false;

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value
        .slice(1, -1)
        .replaceAll('\\"', '"')
        .replaceAll("\\n", "\n")
        .replaceAll("\\\\", "\\");
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}
