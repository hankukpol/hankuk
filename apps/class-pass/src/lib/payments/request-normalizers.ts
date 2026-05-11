import { normalizeCardCompanyName } from './card-companies'

export function resolveDepositorName(
  depositorName: string | null | undefined,
  bankAccountLast4: string | null | undefined,
) {
  const primary = depositorName?.trim()
  if (primary) {
    return primary
  }

  const legacy = bankAccountLast4?.trim()
  return legacy || null
}

export function normalizeCardCompanyInput(value: string | null | undefined) {
  return normalizeCardCompanyName(value)
}
