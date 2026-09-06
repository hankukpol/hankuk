const DEFAULT_ERROR_MESSAGE = '요청을 처리하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.'

// Translate at the presentation boundary; keep original errors available to logging.
// Never expose raw database details, HTML responses, or internal error codes.
const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/failed to fetch|fetch failed|network ?error|network request failed|load failed|err_network/i,
    '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요. 저장 중이었다면 처리 결과를 먼저 확인한 뒤 다시 시도해 주세요.'],
  [/chunkloaderror|loading (?:css )?chunk|dynamically imported module/i,
    '업데이트된 화면을 불러오지 못했습니다. 화면을 새로고침해 주세요.'],
  [/timeout|timed out|aborterror|request aborted|signal is aborted/i,
    '서버 응답이 늦어 요청이 중단되었습니다. 저장 중이었다면 처리 결과를 먼저 확인한 뒤 다시 시도해 주세요.'],
  [/jwt expired|token.*expired|session.*expired|unauthorized|not authenticated|authentication required|invalid.*(?:jwt|token)/i,
    '로그인 정보를 확인할 수 없거나 유효기간이 지났습니다. 다시 로그인한 뒤 이용해 주세요.'],
  [/invalid login credentials|invalid credentials/i,
    '로그인 정보가 올바르지 않습니다. 아이디와 비밀번호 또는 인증번호를 확인해 주세요.'],
  [/permission denied|forbidden|row.level security|insufficient.privilege|42501/i,
    '이 작업을 처리할 권한이 없습니다. 현재 로그인한 계정과 접근 권한을 관리자에게 확인해 주세요.'],
  [/duplicate key|unique constraint|23505|already exists/i,
    '이미 등록된 정보와 중복되어 저장하지 못했습니다. 기존 등록 내역을 확인하고 중복된 값을 수정해 주세요.'],
  [/foreign key|23503/i,
    '연결된 데이터 때문에 작업을 완료하지 못했습니다. 관련 강좌·수강생·이용 기록을 확인해 주세요.'],
  [/not.null constraint|null value in column|23502|required field/i,
    '필수 입력 정보가 빠져 있습니다. 입력 항목을 확인하고 누락된 내용을 채워 주세요.'],
  [/invalid input syntax|check constraint|out of range|22003|22007|22P02|23514/i,
    '입력한 값의 형식이나 범위가 올바르지 않습니다. 날짜, 숫자, 금액 등 입력 내용을 확인해 주세요.'],
  [/too many requests|rate limit/i,
    '짧은 시간에 요청이 많이 발생했습니다. 잠시 기다린 뒤 다시 시도해 주세요.'],
  [/payload too large|file too large|maximum.*(?:file|upload).*size/i,
    '파일 용량이 허용 범위를 초과했습니다. 파일 크기를 줄이거나 나누어 올려 주세요.'],
  [/schema cache|does not exist|could not find.*(?:column|table|function)|PGRST20[245]/i,
    '서비스의 데이터 설정을 확인해야 합니다. 관리자에게 어떤 화면에서 어떤 작업 중 오류가 발생했는지 알려 주세요.'],
  [/unexpected token|unexpected end|json.parse|not valid json|internal server error|bad gateway|service unavailable/i,
    '서버에서 정상적인 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요. 저장 중이었다면 처리 결과를 먼저 확인해 주세요.'],
  [/not found|no rows|0 rows|SOURCE_COURSE_NOT_FOUND/i,
    '요청한 정보를 찾을 수 없습니다. 다른 작업에서 변경되었을 수 있으니 화면을 새로고침하고 다시 확인해 주세요.'],
]

export function getUserErrorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  const message = typeof error === 'string'
    ? error.trim()
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message.trim()
      : ''

  for (const [pattern, translation] of ERROR_MESSAGES) {
    if (pattern.test(message)) return translation
  }

  // Preserve actionable Korean validation messages, not Korean wrappers around
  // raw SQL, HTML, or a serialized exception.
  if (/[가-힣]/.test(message) && !/<!doctype|<html|\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b|"(?:stack|details|hint)"\s*:|\bat \S+\s*\(/i.test(message)) {
    return message
  }
  return /[가-힣]/.test(fallback) ? fallback : DEFAULT_ERROR_MESSAGE
}
