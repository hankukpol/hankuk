const { createRequire } = require('node:module')
const { readdirSync } = require('node:fs')
const path = require('node:path')

// Reuse the monorepo's installed DOM test runtime without adding a nested lockfile.
let JSDOM
try {
  ;({ JSDOM } = require('jsdom'))
} catch {
  const store = path.resolve(__dirname, '../../../../node_modules/.pnpm')
  const entry = readdirSync(store).find((name) => name.startsWith('jsdom@'))
  if (!entry) throw new Error('Install the monorepo dependencies to run DOM tests.')
  ;({ JSDOM } = createRequire(path.join(store, entry, 'node_modules', 'test.cjs'))('jsdom'))
}
module.exports = { JSDOM }
