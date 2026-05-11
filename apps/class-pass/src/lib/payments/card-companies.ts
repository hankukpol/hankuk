export const CARD_COMPANIES = ['BC', 'KB', 'NH', '삼성', '신한', '하나', '현대', '롯데'] as const

export type CardCompany = typeof CARD_COMPANIES[number]

const CARD_COMPANY_ALIASES: Record<string, CardCompany> = {
  BC: 'BC',
  'BC카드': 'BC',
  비씨: 'BC',
  비씨카드: 'BC',
  KB: 'KB',
  'KB국민': 'KB',
  'KB국민카드': 'KB',
  국민: 'KB',
  국민카드: 'KB',
  NH: 'NH',
  'NH농협': 'NH',
  'NH농협카드': 'NH',
  농협: 'NH',
  농협카드: 'NH',
  SAMSUNG: '삼성',
  삼성: '삼성',
  삼성카드: '삼성',
  SINHAN: '신한',
  SHINHAN: '신한',
  신한: '신한',
  신한카드: '신한',
  HANA: '하나',
  하나: '하나',
  하나카드: '하나',
  HYUNDAI: '현대',
  현대: '현대',
  현대카드: '현대',
  LOTTE: '롯데',
  롯데: '롯데',
  롯데카드: '롯데',
}

export function normalizeCardCompanyName(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  const upper = trimmed.toUpperCase()
  return CARD_COMPANY_ALIASES[trimmed] ?? CARD_COMPANY_ALIASES[upper] ?? null
}
