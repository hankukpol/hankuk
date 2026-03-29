const fs = require("node:fs");
const path = require("node:path");

const targets = [".next", "tsconfig.tsbuildinfo"];

for (const target of targets) {
  const targetPath = path.join(process.cwd(), target);

  if (!fs.existsSync(targetPath)) {
    continue;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
}
