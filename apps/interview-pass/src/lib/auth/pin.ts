import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import type { TenantType } from '@/lib/tenant'

type PinConfigKey = 'staff_pin_hash' | 'admin_pin_hash'

const CONFIG_DESCRIPTIONS: Record<PinConfigKey, string> = {
  staff_pin_hash: 'Shared staff PIN bcrypt hash',
  admin_pin_hash: 'Admin PIN bcrypt hash',
}

function getSharedConfigKey(key: PinConfigKey) {
  return key
}

function getScopedAdminIdKeys(division: TenantType) {
  return [`${division}::admin_id`, 'admin_id'] as const
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!pin || !hash) return false
  return bcrypt.compare(pin, hash)
}

export async function getPinHash(key: PinConfigKey): Promise<string> {
  const db = createServerClient()
  const { data, error } = await db
    .from('app_config')
    .select('config_value')
    .eq('config_key', getSharedConfigKey(key))
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load ${key}.`)
  }

  return typeof data?.config_value === 'string' ? data.config_value : ''
}

export async function setPinHash(key: PinConfigKey, hash: string): Promise<void> {
  const db = createServerClient()
  const configKey = getSharedConfigKey(key)
  const { error } = await db
    .from('app_config')
    .upsert({
      config_key: configKey,
      config_value: hash,
      description: CONFIG_DESCRIPTIONS[key],
      updated_at: new Date().toISOString(),
    })

  if (error) {
    throw new Error(`Failed to persist ${key}.`)
  }
}

export async function getAdminId(): Promise<string> {
  const division = await getServerTenantType()
  return getAdminIdForDivision(division)
}

export async function getAdminIdForDivision(division: TenantType): Promise<string> {
  const db = createServerClient()
  const configKeys = getScopedAdminIdKeys(division)
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
  const [scopedKey] = getScopedAdminIdKeys(await getServerTenantType())
  const { error } = await db
    .from('app_config')
    .upsert({
      config_key: scopedKey,
      config_value: id,
      description: 'Admin login identifier',
      updated_at: new Date().toISOString(),
    })

  if (error) {
    throw new Error('Failed to persist admin ID.')
  }
}
