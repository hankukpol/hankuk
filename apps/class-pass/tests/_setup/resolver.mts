// Custom ESM resolver: redirects `server-only` to a no-op stub so unit tests
// can load modules that import it at the top level.
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const STUB_URL = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'server-only-noop.mjs'),
).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { url: STUB_URL, shortCircuit: true, format: 'module' }
  }
  return nextResolve(specifier, context)
}
