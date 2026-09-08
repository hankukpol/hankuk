import { toApiErrorResponse } from "@/lib/api-error-response";

/** Keep failures at the HTTP boundary; never turn failed writes into successful defaults. */
export function withApiHandler<Args extends unknown[], Result extends Response>(
  handler: (...args: Args) => Promise<Result>,
  fallbackMessage: string,
) {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toApiErrorResponse(error, fallbackMessage, 500);
    }
  };
}
