import { createHmac } from 'node:crypto'
import { ATTENDANCE_ROTATION_MS } from '@/lib/attendance/constants'
import {
  createOpaqueDisplayToken,
  hashToken,
} from '@/lib/designated-seat/token'

function getSecretValue() {
  const secret =
    process.env.DESIGNATED_SEAT_SECRET?.trim()
    || process.env.QR_HMAC_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()

  if (!secret || secret.length < 32) {
    throw new Error('An attendance signing secret of at least 32 characters is required.')
  }

  return secret
}

export function getAttendanceRotationBucket(at = Date.now()) {
  return Math.floor(at / ATTENDANCE_ROTATION_MS)
}

export function generateAttendanceRotationCode(params: {
  displaySessionId: number
  courseId: number
  rotation?: number
}) {
  const rotation = params.rotation ?? getAttendanceRotationBucket()
  const digest = createHmac('sha256', getSecretValue())
    .update(`${params.displaySessionId}:${params.courseId}:${rotation}:attendance-code`)
    .digest('hex')

  return String(Number.parseInt(digest.slice(0, 10), 16) % 1_000_000).padStart(6, '0')
}

export function verifyAttendanceRotationCode(params: {
  code: string
  displaySessionId: number
  courseId: number
  rotation?: number
}) {
  return params.code === generateAttendanceRotationCode({
    displaySessionId: params.displaySessionId,
    courseId: params.courseId,
    rotation: params.rotation,
  })
}

export {
  createOpaqueDisplayToken,
  hashToken,
}
