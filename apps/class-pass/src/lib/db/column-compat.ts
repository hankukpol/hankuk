function getErrorField(error: unknown, field: string) {
  if (typeof error !== 'object' || error === null || !(field in error)) {
    return ''
  }

  const value = (error as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

function getErrorText(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return [
    getErrorField(error, 'code'),
    getErrorField(error, 'message'),
    getErrorField(error, 'details'),
    getErrorField(error, 'hint'),
  ].filter(Boolean).join(' ')
}

export function isColumnMissingError(error: unknown, columnName: string) {
  const code = getErrorField(error, 'code')
  const text = getErrorText(error).toLowerCase()

  return text.includes(columnName.toLowerCase()) && (
    code === 'PGRST204'
    || code === '42703'
    || text.includes('schema cache')
    || text.includes('could not find')
    || text.includes('does not exist')
    || text.includes('column')
  )
}

export function isStudentTypeColumnMissing(error: unknown) {
  return isColumnMissingError(error, 'student_type')
}

export function omitStudentType<T extends Record<string, unknown>>(payload: T) {
  const rest = { ...payload }
  delete rest.student_type
  return rest
}
