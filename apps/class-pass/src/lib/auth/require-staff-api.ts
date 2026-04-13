import { NextRequest } from 'next/server'
import { authenticateStaffRequest } from '@/lib/auth/authenticate'

export async function requireStaffApi(req: NextRequest) {
  const { error } = await authenticateStaffRequest(req)
  return error
}
