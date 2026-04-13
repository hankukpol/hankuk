import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

type PinConfigKey = 'staff_pin_hash' | 'admin_pin_hash'

async function getScopedConfigKey(key: string) {
  const division = await getServerTenantType()
  return `${division}::${key}`
}

async function getScopedAdminIdKey() {
  const division = await getServerTenantType()
  return `${division}::admin_id`
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!pin || !hash) {
    return false
  }

  return bcrypt.compare(pin, hash)
}

export async function comparePin(pin: string, hash: string): Promise<boolean> {
  return verifyPin(pin, hash)
}

export async function generateStudentPin(): Promise<{ pin: string; hash: string }> {
  const pin = String(Math.floor(1000 + Math.random() * 9000))
  const hash = await hashPin(pin)
  return { pin, hash }
}

export async function getPinHash(key: PinConfigKey): Promise<string> {
  const db = createServerClient()
  const configKey = await getScopedConfigKey(key)
  const { data, error } = await db
    .from('app_config')
    .select('value')
    .eq('key', configKey)
    .maybeSingle()

  if (error) {
    console.error(`[getPinHash] key=${configKey} error:`, error.message, error.code, error.details)
    throw new Error(`Failed to load ${key}: ${error.message}`)
  }

  return typeof data?.value === 'string' ? data.value : ''
}

export async function setPinHash(key: PinConfigKey, hash: string): Promise<void> {
  const db = createServerClient()
  const scopedKey = await getScopedConfigKey(key)
  const { error } = await db.from('app_config').upsert({
    key: scopedKey,
    value: hash,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) {
    throw new Error(`Failed to persist ${key}.`)
  }
}

export async function getAdminId(): Promise<string> {
  const db = createServerClient()
  const configKey = await getScopedAdminIdKey()
  const { data, error } = await db
    .from('app_config')
    .select('value')
    .eq('key', configKey)
    .maybeSingle()

  if (error) {
    throw new Error('Failed to load admin ID.')
  }

  return typeof data?.value === 'string' ? data.value : ''
}

export async function setAdminId(id: string): Promise<void> {
  const db = createServerClient()
  const scopedKey = await getScopedAdminIdKey()
  const { error } = await db.from('app_config').upsert({
    key: scopedKey,
    value: id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) {
    throw new Error('Failed to persist admin ID.')
  }
}
