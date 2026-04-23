const ROTATION_CODE_PATTERN = /^\d{4,6}$/
const ROTATION_CODE_FLEX_PATTERN = /^\D*(\d[\d\s-]{2,10}\d)\D*$/

export type DesignatedSeatVerificationPayload =
  | { verificationMethod: 'qr'; rotationToken: string }
  | { verificationMethod: 'code'; rotationCode: string }

function tryParseScanUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    try {
      return new URL(value, 'https://designated-seat.local')
    } catch {
      return null
    }
  }
}

function getFirstSearchParam(url: URL, names: string[]) {
  for (const name of names) {
    const value = url.searchParams.get(name)?.trim()
    if (value) {
      return value
    }
  }

  return null
}

function normalizeRotationCodeCandidate(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (ROTATION_CODE_PATTERN.test(trimmed)) {
    return trimmed
  }

  const matched = trimmed.match(ROTATION_CODE_FLEX_PATTERN)
  if (!matched) {
    return null
  }

  const digitsOnly = matched[1].replace(/\D/g, '')
  return ROTATION_CODE_PATTERN.test(digitsOnly) ? digitsOnly : null
}

export function buildDesignatedSeatQrValue(rotationToken: string) {
  return `https://designated-seat.local/verify?token=${encodeURIComponent(rotationToken.trim())}`
}

export function parseDesignatedSeatScanValue(value: string): DesignatedSeatVerificationPayload | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsedUrl = tryParseScanUrl(trimmed)
  if (parsedUrl) {
    const rotationToken = getFirstSearchParam(parsedUrl, ['token', 'rotationToken'])
    if (rotationToken) {
      return {
        verificationMethod: 'qr',
        rotationToken,
      }
    }

    const rotationCode = normalizeRotationCodeCandidate(getFirstSearchParam(parsedUrl, ['code', 'rotationCode']) ?? '')
    if (rotationCode) {
      return {
        verificationMethod: 'code',
        rotationCode,
      }
    }
  }

  const normalizedCode = normalizeRotationCodeCandidate(trimmed)
  if (normalizedCode) {
    return {
      verificationMethod: 'code',
      rotationCode: normalizedCode,
    }
  }

  return {
    verificationMethod: 'qr',
    rotationToken: trimmed,
  }
}
