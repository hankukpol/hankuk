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
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.startsWith('KB') ? 'KB' : trimmed
}
