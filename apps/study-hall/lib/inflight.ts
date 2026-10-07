/**
 * 같은 인자로 동시에 진행 중인 호출은 하나의 결과를 나눠 쓴다. 끝나면 바로 잊는다(다음 호출은 새로 읽는다).
 *
 * React cache() 는 화면 렌더 안에서만 동작해 API 라우트에서는 효과가 없다. 이 방식은 어디서든 동작하고
 * 오래된 값을 돌려주지 않는다. 결과는 여러 호출이 함께 쓰므로 읽기 전용으로만 다뤄야 한다.
 */
export function shareInflight<Args extends unknown[], Result>(
  key: (...args: Args) => string,
  load: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  const running = new Map<string, Promise<Result>>();
  return (...args: Args) => {
    const id = key(...args);
    const current = running.get(id);
    if (current) return current;
    const promise = load(...args).finally(() => running.delete(id));
    running.set(id, promise);
    return promise;
  };
}
