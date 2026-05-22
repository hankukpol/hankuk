// CJS-side stub for `server-only`. tsx compiles `.ts` files to CommonJS,
// so the transitive `import 'server-only'` from Next.js server modules goes
// through CJS resolution. This hook short-circuits that to a no-op module.
const Module = require('node:module')
const path = require('node:path')

const STUB_PATH = path.resolve(__dirname, 'server-only-noop.cjs')
const originalResolve = Module._resolveFilename

Module._resolveFilename = function patched(request, parent, ...rest) {
  if (request === 'server-only') {
    return STUB_PATH
  }
  return originalResolve.call(this, request, parent, ...rest)
}
