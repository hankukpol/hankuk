'use client'

type PermissionStateLike = 'granted' | 'prompt' | 'denied'

type NavigatorWithCameraPermissions = Navigator & {
  permissions?: {
    query?: (descriptor: { name: string }) => Promise<{ state: string }>
  }
}

export async function getCameraPermissionState(): Promise<PermissionStateLike | null> {
  if (typeof navigator === 'undefined') {
    return null
  }

  const query = (navigator as NavigatorWithCameraPermissions).permissions?.query
  if (typeof query !== 'function') {
    return null
  }

  try {
    const result = await query({ name: 'camera' })
    if (result.state === 'granted' || result.state === 'prompt' || result.state === 'denied') {
      return result.state
    }
  } catch {
    // Some browsers expose the API but do not support camera permission queries.
  }

  return null
}

export async function getCameraReadinessError(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return '카메라를 준비할 수 없습니다.'
  }

  if (!window.isSecureContext) {
    return '카메라는 HTTPS 환경에서만 사용할 수 있습니다.'
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return '이 브라우저는 카메라 기능을 지원하지 않습니다.'
  }

  const permissionState = await getCameraPermissionState()
  if (permissionState === 'denied') {
    return '브라우저에서 카메라 권한이 차단되어 있습니다. 주소창의 권한 설정을 확인해 주세요.'
  }

  return null
}

export function getCameraAccessErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return '카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용한 뒤 다시 시도해 주세요.'
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return '사용 가능한 카메라를 찾지 못했습니다.'
      case 'NotReadableError':
      case 'TrackStartError':
        return '다른 앱이 카메라를 사용 중입니다. 카메라를 점유한 앱을 종료한 뒤 다시 시도해 주세요.'
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return '후면 카메라를 찾지 못해 기본 카메라로 전환하지 못했습니다. 브라우저를 다시 열고 시도해 주세요.'
      default:
        break
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return '카메라를 시작하지 못했습니다. 브라우저 권한과 기기 상태를 확인해 주세요.'
}
