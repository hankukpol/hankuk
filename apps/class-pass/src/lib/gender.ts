export function normalizeGenderLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ''
  }

  const normalized = trimmed.toLowerCase()
  if (normalized === '남' || normalized === '남자' || normalized === '남성' || normalized === 'male' || normalized === 'm') {
    return '남'
  }

  if (normalized === '여' || normalized === '여자' || normalized === '여성' || normalized === 'female' || normalized === 'f') {
    return '여'
  }

  return trimmed
}
