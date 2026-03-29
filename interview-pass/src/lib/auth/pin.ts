import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

function getSharedConfigKey(key: 'staff_pin_hash' | 'admin_pin_hash') {
  return key
}

async function getScopedAdminIdKeys() {
  const division = await getServerTenantType()
  return [`${division}::admin_id`, 'admin_id'] as const
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!pin || !hash) return false
  return bcrypt.compare(pin, hash)
}

export async function getPinHash(key: 'staff_pin_hash' | 'admin_pin_hash'): Promise<string> {
  const db = createServerClient()
  const { data } = await db
    .from('app_config')
    .select('config_value')
    .eq('config_key', getSharedConfigKey(key))
    .single()

  return (data?.config_value as string) ?? ''
}

export async function setPinHash(
  key: 'staff_pin_hash' | 'admin_pin_hash',
  hash: string,
): Promise<void> {
  const db = createServerClient()
  await db
    .from('app_config')
    .update({ config_value: hash, updated_at: new Date().toISOString() })
    .eq('config_key', getSharedConfigKey(key))
}

export async function getAdminId(): Promise<string> {
  const db = createServerClient()
  const configKeys = await getScopedAdminIdKeys()
  const { data } = await db
    .from('app_config')
    .select('config_key, config_value')
    .in('config_key', [...configKeys])

  const scopedKey = configKeys[0]
  const scopedValue = data?.find((row) => row.config_key === scopedKey)?.config_value
  const fallbackValue = data?.find((row) => row.config_key === 'admin_id')?.config_value

  return (typeof scopedValue === 'string' ? scopedValue : typeof fallbackValue === 'string' ? fallbackValue : '') ?? ''
}

export async function setAdminId(id: string): Promise<void> {
  const db = createServerClient()
  const [scopedKey] = await getScopedAdminIdKeys()

  await db
    .from('app_config')
    .upsert({
      config_key: scopedKey,
      config_value: id,
      description: '관리자 아이디',
      updated_at: new Date().toISOString(),
    })
}
