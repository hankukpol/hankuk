import { NextResponse } from 'next/server'
import { STAFF_COOKIE } from '@/lib/auth/jwt'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(STAFF_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
