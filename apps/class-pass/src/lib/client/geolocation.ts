import { getBrowserEnvironment, type BrowserContext } from '@/lib/client/browser-env'

export type ClientPresenceLocation = {
  latitude: number
  longitude: number
  accuracy: number
  capturedAt: string
  source: 'browser-geolocation'
  browserContext: BrowserContext
}

export type ClientPresenceErrorCode =
  | 'unsupported'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'policy_blocked'
  | 'not_mobile'

export type ClientPresenceError = {
  errorCode: ClientPresenceErrorCode
  message: string
  browserContext: BrowserContext
}

export type ClientPresenceResult =
  | { ok: true; location: ClientPresenceLocation }
  | { ok: false; error: ClientPresenceError }

function getPositionErrorCode(error: GeolocationPositionError): ClientPresenceErrorCode {
  if (error.message && /permission.?policy|permissions.?policy/i.test(error.message)) {
    return 'policy_blocked'
  }

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'permission_denied'
    case error.POSITION_UNAVAILABLE:
      return 'position_unavailable'
    case error.TIMEOUT:
      return 'timeout'
    default:
      return 'position_unavailable'
  }
}

function getLocationErrorMessage(code: ClientPresenceErrorCode, browserContext: BrowserContext) {
  if (browserContext === 'kakao') {
    switch (code) {
      case 'permission_denied':
        return '카카오톡에서 위치 권한이 허용되지 않았습니다. 다시 시도하거나 Safari/Chrome에서 열어 주세요.'
      case 'timeout':
        return '카카오톡에서 위치 확인 시간이 초과되었습니다. 다시 시도하거나 Safari/Chrome에서 열어 주세요.'
      default:
        return '카카오톡 내장 브라우저에서 위치 확인이 불안정합니다. 다시 시도하거나 Safari/Chrome에서 열어 주세요.'
    }
  }

  switch (code) {
    case 'unsupported':
      return '이 브라우저는 위치 확인을 지원하지 않습니다. Safari 또는 Chrome에서 이용해 주세요.'
    case 'permission_denied':
      return '위치 권한이 허용되지 않았습니다. 권한을 허용한 뒤 다시 시도해 주세요.'
    case 'timeout':
      return '위치 확인 시간이 초과되었습니다. 잠시 뒤 다시 시도해 주세요.'
    case 'policy_blocked':
      return '브라우저 정책 때문에 위치 확인이 차단되었습니다. Safari 또는 Chrome에서 다시 열어 주세요.'
    case 'not_mobile':
      return '출석과 좌석지정은 학생 본인의 스마트폰에서 진행해 주세요.'
    case 'position_unavailable':
    default:
      return '현재 기기에서 위치를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
  }
}

export async function getPresenceLocation(): Promise<ClientPresenceResult> {
  const env = getBrowserEnvironment()

  if (!env.isMobile) {
    return {
      ok: false,
      error: {
        errorCode: 'not_mobile',
        message: getLocationErrorMessage('not_mobile', env.browserContext),
        browserContext: env.browserContext,
      },
    }
  }

  if (!navigator.geolocation) {
    return {
      ok: false,
      error: {
        errorCode: 'unsupported',
        message: getLocationErrorMessage('unsupported', env.browserContext),
        browserContext: env.browserContext,
      },
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date(position.timestamp).toISOString(),
            source: 'browser-geolocation',
            browserContext: env.browserContext,
          },
        })
      },
      (error) => {
        const errorCode = getPositionErrorCode(error)
        resolve({
          ok: false,
          error: {
            errorCode,
            message: getLocationErrorMessage(errorCode, env.browserContext),
            browserContext: env.browserContext,
          },
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      },
    )
  })
}
