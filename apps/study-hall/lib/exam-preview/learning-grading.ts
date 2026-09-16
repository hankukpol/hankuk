/** Imported OMR marks remain authoritative; a list of keys does not say
 * whether any one choice or the complete set is required for a new attempt. */
export function regradeIssue(answerKey: string, choices: string[]) {
  if (answerKey.includes(","))
    return "복수 정답의 인정 방식이 자료에 없어 자동 채점을 보류합니다. 시험지의 채점 기준을 확인해주세요.";
  if (!answerKey.trim() || (choices.length > 0 && !choices.includes(answerKey)))
    return "정답 정보와 선택지가 일치하지 않아 자동 채점을 할 수 없습니다. 관리자에게 문항 정보를 확인해주세요.";
  return null;
}
