import { getDistributionReasonMessage } from '@/lib/distribution/reason-messages'
import type { BootstrapResponse, ScanResponse } from './scan-page-types'

export const OVERLAY_TIMEOUT_MS = 1800
export const ERROR_OVERLAY_TIMEOUT_MS = 2200
export const SCAN_COOLDOWN_MS = 2500

export async function fetchBootstrapData(courseId?: number | null): Promise<BootstrapResponse> {
  const query = courseId ? `?courseId=${courseId}` : ''
  const response = await fetch(`/api/distribution/staff-bootstrap${query}`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as BootstrapResponse | null

  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error ?? '직원 배부 데이터를 불러오지 못했습니다.')
  }

  return {
    session: payload?.session ?? { role: 'staff' },
    staffScanEnabled: payload?.staffScanEnabled !== false,
    staffQuickEnabled: payload?.staffQuickEnabled !== false,
    selectedCourseId: payload?.selectedCourseId ?? null,
    courses: payload?.courses ?? [],
    materials: payload?.materials ?? [],
  }
}

export function normalizeToken(rawValue: string) {
  try {
    const url = new URL(rawValue)
    return url.searchParams.get('token') ?? rawValue
  } catch {
    return rawValue
  }
}

export function getScanReasonMessage(reason?: string) {
  // 직원 스캔과 관리자 배부가 같은 문구를 보도록 공용 매핑만 사용한다.
  return getDistributionReasonMessage(reason)
}

export function getScanFailureDescription(payload?: ScanResponse | null) {
  if (payload?.reason === 'ALL_RECEIVED') {
    return payload.studentName
      ? `${payload.studentName} 학생은 현재 받을 미수령 자료가 없습니다.`
      : '현재 받을 미수령 자료가 없습니다.'
  }

  if (payload?.reason === 'COURSE_MISMATCH') {
    const studentText = payload.studentName ? `${payload.studentName} 학생의 QR입니다. ` : ''

    if (payload.selectedCourseName && payload.courseName) {
      return `${studentText}현재 선택 강좌는 "${payload.selectedCourseName}"이고, QR은 "${payload.courseName}" 수강증입니다. 선택한 강좌 수강증 QR로 다시 스캔해 주세요.`
    }

    if (payload.courseName) {
      return `${studentText}QR은 "${payload.courseName}" 수강증입니다. 선택한 강좌 수강증 QR로 다시 스캔해 주세요.`
    }
  }

  const reasonMessage = getScanReasonMessage(payload?.reason)
  return payload?.studentName ? `${payload.studentName} 학생: ${reasonMessage}` : reasonMessage
}

export function formatMaterialLabel(name: string, materialType?: 'handout' | 'textbook') {
  if (materialType === 'textbook') {
    return `${name} [교재]`
  }

  if (materialType === 'handout') {
    return `${name} [배부자료]`
  }

  return name
}

export function summarizeDistributedMaterials(
  materials: Array<{ name: string; material_type?: 'handout' | 'textbook' }> | undefined,
) {
  if (!materials || materials.length === 0) {
    return '자료 배부 완료'
  }

  if (materials.length === 1) {
    return `${formatMaterialLabel(materials[0].name, materials[0].material_type)} 배부 완료`
  }

  return `${materials.length}건 배부 완료`
}

export function describeDistributedMaterials(
  materials: Array<{ name: string; material_type?: 'handout' | 'textbook' }> | undefined,
) {
  if (!materials || materials.length === 0) {
    return undefined
  }

  if (materials.length <= 2) {
    return materials.map((material) => formatMaterialLabel(material.name, material.material_type)).join(', ')
  }

  return `${formatMaterialLabel(materials[0].name, materials[0].material_type)} 외 ${materials.length - 1}건`
}
