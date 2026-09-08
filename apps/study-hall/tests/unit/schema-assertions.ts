import assert from "node:assert/strict";
import type { ZodType } from "zod";

/** Assert both rejection and the field the UI can use to explain it. */
export function rejectsAt(schema: ZodType, input: unknown, path: string) {
  const result = schema.safeParse(input);
  assert.equal(result.success, false, `Expected rejection at ${path}`);
  if (result.success) assert.fail("Unexpected valid input");
  assert.ok(
    result.error.issues.some((issue) => issue.path.join(".") === path),
    `Expected ${path}; got ${JSON.stringify(result.error.issues)}`,
  );
}
