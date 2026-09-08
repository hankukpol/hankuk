/** Only a same-site absolute path may be used after establishing a session. */
export function normalizeTargetPath(targetPath: string | null | undefined, fallback: string) {
  if (
    !targetPath ||
    !targetPath.startsWith("/") ||
    targetPath.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(targetPath)
  ) {
    return fallback;
  }

  return targetPath;
}
