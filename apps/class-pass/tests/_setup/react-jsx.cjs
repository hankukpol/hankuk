// tsx uses classic JSX for this Next app's `jsx: preserve` configuration.
// Keep the JSX runtime available in Node tests without changing the app compiler.
globalThis.React = require('react')

// CSS modules are verified in browser QA; Node component tests need only class names.
require.extensions['.css'] = (module) => {
  module.exports = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) })
}
