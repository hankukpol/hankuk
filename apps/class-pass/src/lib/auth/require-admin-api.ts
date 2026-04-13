import { NextRequest } from 'next/server'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'

export async function requireAdminApi(req: NextRequest) {
  const { error } = await authenticateAdminRequest(req)
  return error
}
