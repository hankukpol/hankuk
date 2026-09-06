import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TenantProvider } from '../../src/components/TenantProvider'
import { buildFallbackTenantConfig } from '../../src/lib/tenant'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load

Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === 'next/font/local') {
    return () => ({ variable: '__variable_admin_test' })
  }

  return originalLoad.call(this, request, parent, isMain)
}

require.extensions['.css'] = () => undefined

const tenantConfig = buildFallbackTenantConfig('police')

async function renderAdminTheme(className?: string) {
  const { AdminTheme } = await import('../../src/components/admin/AdminTheme')

  return renderToStaticMarkup(
    createElement(
      TenantProvider,
      {
        tenantConfig,
        children: createElement(
          AdminTheme,
          { className, children: createElement('main', { id: 'admin-main' }, '관리자') },
        ),
      },
    ),
  )
}

test('AdminTheme applies the shared admin shell, tenant marker and local font variable', async () => {
  const markup = await renderAdminTheme('admin-standalone-shell')

  assert.match(markup, /class="[^"]*admin-shell/)
  assert.match(markup, /class="[^"]*admin-standalone-shell/)
  assert.match(markup, /class="[^"]*__variable_/)
  assert.match(markup, /data-tenant="police"/)
  assert.match(markup, /<main id="admin-main">관리자<\/main>/)
  assert.match(markup, /<div id="admin-portal-root"><\/div>/, 'all admin shells keep portal dialogs inside their theme')
})
