import type { BootstrapResponse } from './scan-page-types'

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
  switch (reason) {
    case 'INVALID_TOKEN':
      return '유효하지 않은 QR 코드입니다.'
    case 'ENROLLMENT_NOT_FOUND':
      return '수강생 정보를 찾을 수 없습니다.'
    case 'ALL_RECEIVED':
      return '모든 자료를 이미 수령했습니다.'
    case 'SELECT_MATERIAL':
      return '배부할 자료를 선택해 주세요.'
    case 'NOT_ASSIGNED':
      return '해당 학생에게 배정되지 않은 교재입니다.'
    case 'DISTRIBUTION_FAILED':
      return '배부 처리에 실패했습니다. 다시 시도해 주세요.'
    default:
      return reason || '요청을 처리하지 못했습니다.'
  }
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
