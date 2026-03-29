type HeaderValueLike = string | string[] | null | undefined;

function readHeaderValue(headers: unknown, key: string): HeaderValueLike {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }

  if (typeof (headers as { get?: unknown }).get === "function") {
    try {
      return ((headers as { get: (name: string) => string | null }).get(key) ?? undefined) as
        | string
        | undefined;
    } catch {
      return undefined;
    }
  }

  const record = headers as Record<string, unknown>;
  const exact = record[key];
  if (typeof exact === "string" || Array.isArray(exact)) {
    return exact as string | string[];
  }

  const lowerKey = key.toLowerCase();
  const lower = record[lowerKey];
  if (typeof lower === "string" || Array.isArray(lower)) {
    return lower as string | string[];
  }

  return undefined;
}

function normalizeHeaderValue(value: HeaderValueLike): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (Array.isArray(value) && value.length > 0) {
    const candidate = value[0];
    return typeof candidate === "string" ? candidate.trim() || null : null;
  }

  return null;
}

function normalizeIp(value: string): string {
  return value.trim().toLowerCase();
}

function getHeadersSource(requestLike: unknown): unknown {
  if (!requestLike || typeof requestLike !== "object") {
    return undefined;
  }

  if ("headers" in (requestLike as Record<string, unknown>)) {
    return (requestLike as { headers: unknown }).headers;
  }

  return requestLike;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    out = (out << 8) | value;
  }

  return out >>> 0;
}

function matchesIpv4Cidr(ip: string, cidr: string): boolean {
  const [baseIp, rawPrefix] = cidr.split("/");
  const prefix = Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(baseIp);
  if (ipInt === null || baseInt === null) {
    return false;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function getAdminIpAllowlistEntries(): string[] {
  const raw = process.env.ADMIN_IP_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter(Boolean);
}

export function hasAdminIpAllowlist(): boolean {
  return getAdminIpAllowlistEntries().length > 0;
}

export function getClientIpFromRequestLike(requestLike: unknown): string {
  const headers = getHeadersSource(requestLike);

  const xRealIp = normalizeHeaderValue(readHeaderValue(headers, "x-real-ip"));
  if (xRealIp) {
    return xRealIp;
  }

  const cfIp = normalizeHeaderValue(readHeaderValue(headers, "cf-connecting-ip"));
  if (cfIp) {
    return cfIp;
  }

  const xForwardedFor = normalizeHeaderValue(readHeaderValue(headers, "x-forwarded-for"));
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  return "unknown";
}

export function isAdminIpAllowed(requestLike: unknown): boolean {
  const allowlist = getAdminIpAllowlistEntries();
  if (allowlist.length < 1) {
    return true;
  }

  const clientIp = normalizeIp(getClientIpFromRequestLike(requestLike));
  if (!clientIp || clientIp === "unknown") {
    return false;
  }

  return allowlist.some((allowedEntry) => {
    if (allowedEntry.includes("/")) {
      return matchesIpv4Cidr(clientIp, allowedEntry);
    }

    return clientIp === allowedEntry;
  });
}
