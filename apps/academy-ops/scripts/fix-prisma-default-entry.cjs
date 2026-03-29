const fs = require('fs');
const path = require('path');
const target = path.resolve(__dirname, '../node_modules/.prisma/client/default.js');
const fallback = "/* patched for Next.js build compatibility */\nmodule.exports = { ...require('./index.js') }\n";
if (!fs.existsSync(target)) {
  console.warn(`[fix-prisma-default-entry] skipped: ${target} not found`);
  process.exit(0);
}
const current = fs.readFileSync(target, 'utf8');
if (current.includes("require('./index.js')")) {
  console.log('[fix-prisma-default-entry] already patched');
  process.exit(0);
}
fs.writeFileSync(target, fallback, 'utf8');
console.log('[fix-prisma-default-entry] patched node_modules/.prisma/client/default.js');
