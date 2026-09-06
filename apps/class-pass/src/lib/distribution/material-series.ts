export const MAX_MATERIAL_SERIES = 52

export function buildMaterialSeriesNames(pattern: string, start: number, end: number): string[] {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 999 || end < start) {
    throw new Error('시작·마지막 회차를 1~999 사이의 정수로 입력해 주세요. 마지막 회차는 시작 회차 이상이어야 합니다.')
  }
  if (end - start + 1 > MAX_MATERIAL_SERIES) {
    throw new Error(`한 번에 최대 ${MAX_MATERIAL_SERIES}개 회차까지 만들 수 있습니다.`)
  }
  if (!pattern.includes('{회차}')) {
    throw new Error('자료 이름에서 숫자가 들어갈 자리에 {회차}를 넣어 주세요.')
  }
  const names = Array.from({ length: end - start + 1 }, (_, index) =>
    pattern.trim().replaceAll('{회차}', String(start + index)))
  if (names.some((name) => name.length === 0 || name.length > 100)) {
    throw new Error('생성될 자료 이름은 100자 이내로 입력해 주세요.')
  }
  return names
}

export function suggestNextMaterialSeries(name?: string) {
  const match = name?.match(/(\d+)(\s*(?:회차|주차|회|주)(?![가-힣]))/)
  if (name && match && match.index !== undefined) {
    const next = Number(match[1]) + 1
    return {
      pattern: `${name.slice(0, match.index)}{회차}${name.slice(match.index + match[1].length)}`,
      start: next,
      end: next,
    }
  }
  return { pattern: name ? `${name} {회차}회차` : '주간 프린트 {회차}회차', start: 1, end: 1 }
}
