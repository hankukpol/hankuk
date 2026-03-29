import { NextResponse } from 'next/server'
import { STAFF_COOKIE, clearCookieOptions } from '@/lib/auth/jwt'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(STAFF_COOKIE, '', clearCookieOptions())
  return res
}
