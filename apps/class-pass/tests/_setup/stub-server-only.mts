// tsx --import target: makes `import 'server-only'` resolve to a no-op
// so unit tests can transitively load modules that mark themselves server-only.
import { register } from 'node:module'

register('./resolver.mts', import.meta.url)
