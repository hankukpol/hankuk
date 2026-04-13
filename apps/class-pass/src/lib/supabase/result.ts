type SupabaseResult<T> = {
  data: T
  error: {
    message: string
    details?: string | null
    hint?: string | null
    code?: string
  } | null
}

export function unwrapSupabaseResult<T>(operation: string, result: SupabaseResult<T>): T {
  if (!result.error) {
    return result.data
  }

  const details = [result.error.message, result.error.details, result.error.hint]
    .filter(Boolean)
    .join(' | ')

  throw new Error(`${operation}: ${details}`)
}
