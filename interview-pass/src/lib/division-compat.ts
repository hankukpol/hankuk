type MaybeError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
} | null | undefined

export function isMissingDivisionColumnError(error: MaybeError) {
  if (!error) {
    return false
  }

  const haystack = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    haystack.includes('division')
    && (haystack.includes('column') || haystack.includes('schema cache') || haystack.includes('42703'))
  )
}

export async function withDivisionFallback<T>(
  scoped: () => PromiseLike<T> | T,
  fallback: () => PromiseLike<T> | T,
): Promise<T> {
  const result = await scoped()
  const error = (result as { error?: MaybeError } | null | undefined)?.error
  if (isMissingDivisionColumnError(error)) {
    return fallback()
  }
  return result
}
