const fs = require("fs");
const path = require("path");

const targetPath = path.resolve(process.cwd(), "node_modules/.prisma/client/default.js");

if (!fs.existsSync(targetPath)) {
  process.exit(0);
}

const current = fs.readFileSync(targetPath, "utf8");
const next = current.replace("require('#main-entry-point')", "require('./index.js')");

if (next !== current) {
  fs.writeFileSync(targetPath, next, "utf8");
}
