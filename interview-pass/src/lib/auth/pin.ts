import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'

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
    .eq('config_key', key)
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
    .eq('config_key', key)
}

export async function getAdminId(): Promise<string> {
  const db = createServerClient()
  const { data } = await db
    .from('app_config')
    .select('config_value')
    .eq('config_key', 'admin_id')
    .single()
  return (data?.config_value as string) ?? ''
}

export async function setAdminId(id: string): Promise<void> {
  const db = createServerClient()
  await db
    .from('app_config')
    .upsert({
      config_key: 'admin_id',
      config_value: id,
      description: '관리자 아이디',
      updated_at: new Date().toISOString(),
    })
}
