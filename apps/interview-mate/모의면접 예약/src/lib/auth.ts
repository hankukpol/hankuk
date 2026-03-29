export function getAccessToken(headers: Headers) {
  return headers.get("x-access-token")?.trim() ?? "";
}

export function getAdminKey(headers: Headers) {
  return headers.get("x-admin-key")?.trim() ?? "";
}

export function isAdminAuthorized(adminKey?: string) {
  return Boolean(adminKey) && adminKey === process.env.ADMIN_KEY;
}
