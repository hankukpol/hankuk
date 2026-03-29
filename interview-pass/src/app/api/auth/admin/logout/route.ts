import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, clearCookieOptions } from '@/lib/auth/jwt'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(ADMIN_COOKIE, '', clearCookieOptions())
  return res
}
