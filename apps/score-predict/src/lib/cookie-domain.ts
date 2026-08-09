export function getCookieDomain() {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
  return cookieDomain ? cookieDomain : undefined;
}

export function withConfiguredCookieDomain<T extends object>(options: T): T & { domain?: string } {
  const cookieDomain = getCookieDomain();

  if (!cookieDomain) {
    return options;
  }

  return {
    ...options,
    domain: cookieDomain,
  };
}
