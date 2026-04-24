export type BrowserContext = 'kakao' | 'safari' | 'chrome' | 'pwa' | 'other'

export type BrowserEnvironment = {
  browserContext: BrowserContext
  isKakaoInApp: boolean
  isIOS: boolean
  isAndroid: boolean
  isMobile: boolean
  isStandalonePwa: boolean
  isSafari: boolean
  isChrome: boolean
}

export function getBrowserEnvironment(): BrowserEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      browserContext: 'other',
      isKakaoInApp: false,
      isIOS: false,
      isAndroid: false,
      isMobile: false,
      isStandalonePwa: false,
      isSafari: false,
      isChrome: false,
    }
  }

  const userAgent = navigator.userAgent || ''
  const isKakaoInApp = /KAKAOTALK/i.test(userAgent)
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(userAgent)
  const isMobile = isIOS || isAndroid || /Mobile/i.test(userAgent)
  const isStandalonePwa = Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone,
  )
  const isChrome = /Chrome|CriOS/i.test(userAgent) && !/Edg|OPR|SamsungBrowser/i.test(userAgent)
  const isSafari = /Safari/i.test(userAgent) && !/Chrome|CriOS|FxiOS|Edg|OPR|KAKAOTALK/i.test(userAgent)
  const browserContext: BrowserContext = isStandalonePwa
    ? 'pwa'
    : isKakaoInApp
      ? 'kakao'
      : isSafari
        ? 'safari'
        : isChrome
          ? 'chrome'
          : 'other'

  return {
    browserContext,
    isKakaoInApp,
    isIOS,
    isAndroid,
    isMobile,
    isStandalonePwa,
    isSafari,
    isChrome,
  }
}
