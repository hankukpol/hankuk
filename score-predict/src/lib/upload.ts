import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface SaveImageUploadOptions {
  file: File;
  prefix: string;
  uploadSubdir: string;
  maxBytes?: number;
  allowedMimeTypes?: ReadonlySet<string>;
}

export interface SavedImageResult {
  fileName: string;
  objectPath: string;
  publicUrl: string;
}

const LOCAL_UPLOAD_PUBLIC_ROOT = "uploads";

function extensionByMimeType(mimeType: string): string | null {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return null;
}

function detectMimeTypeByMagicBytes(bytes: Uint8Array): string | null {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) {
    return "image/jpeg";
  }

  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPng) {
    return "image/png";
  }

  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (isWebp) {
    return "image/webp";
  }

  return null;
}

function sanitizePrefix(prefix: string): string {
  const sanitized = prefix.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  return sanitized || "upload";
}

export async function validateImageFile(
  file: File,
  options?: {
    maxBytes?: number;
    allowedMimeTypes?: ReadonlySet<string>;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const maxBytes = options?.maxBytes ?? DEFAULT_IMAGE_MAX_BYTES;
  const allowedMimeTypes = options?.allowedMimeTypes ?? DEFAULT_ALLOWED_IMAGE_MIME_TYPES;

  if (!allowedMimeTypes.has(file.type)) {
    return { ok: false, error: "jpg, png, webp 형식의 이미지 파일만 업로드할 수 있습니다." };
  }

  if (file.size > maxBytes) {
    const maxMb = Math.floor(maxBytes / (1024 * 1024));
    return { ok: false, error: `이미지 파일은 ${maxMb}MB 이하만 업로드할 수 있습니다.` };
  }

  if (!extensionByMimeType(file.type)) {
    return { ok: false, error: "지원하지 않는 파일 형식입니다." };
  }

  const headBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detectedMimeType = detectMimeTypeByMagicBytes(headBytes);
  if (!detectedMimeType || !allowedMimeTypes.has(detectedMimeType)) {
    return { ok: false, error: "이미지 파일 시그니처를 확인할 수 없습니다. jpg/png/webp 파일만 가능합니다." };
  }

  if (detectedMimeType !== file.type) {
    return { ok: false, error: "파일 확장자 또는 MIME 타입이 실제 이미지 형식과 일치하지 않습니다." };
  }

  return { ok: true };
}

export async function saveImageUpload(options: SaveImageUploadOptions): Promise<SavedImageResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_IMAGE_MAX_BYTES;
  const allowedMimeTypes = options.allowedMimeTypes ?? DEFAULT_ALLOWED_IMAGE_MIME_TYPES;
  const validation = await validateImageFile(options.file, { maxBytes, allowedMimeTypes });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const extension = extensionByMimeType(options.file.type);
  if (!extension) {
    throw new Error("지원하지 않는 파일 형식입니다.");
  }

  const safePrefix = sanitizePrefix(options.prefix);
  const fileName = `${safePrefix}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  const objectPath = `${options.uploadSubdir}/${fileName}`;

  const fileBuffer = new Uint8Array(await options.file.arrayBuffer());
  let publicUrl: string;
  try {
    await uploadToSupabaseStorage({
      objectPath,
      body: new Blob([fileBuffer], { type: options.file.type }),
      contentType: options.file.type,
    });
    publicUrl = buildSupabasePublicUrl(objectPath);
  } catch (error) {
    if (!shouldUseLocalUploadFallback()) {
      throw error;
    }
    console.warn("Supabase Storage upload failed. Falling back to local public uploads in development.", error);
    await saveToLocalPublicUploads(objectPath, fileBuffer);
    publicUrl = buildLocalPublicUrl(objectPath);
  }

  return {
    fileName,
    objectPath,
    publicUrl,
  };
}

function resolveSupabaseUrl(): string {
  const fromServer = readEnv("SUPABASE_URL");
  const fromPublic = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const value = fromServer || fromPublic;
  if (!value) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required for storage uploads.");
  }

  try {
    return new URL(value).origin;
  } catch {
    throw new Error("SUPABASE_URL is invalid. Use a full URL such as https://<project>.supabase.co");
  }
}

function resolveServiceRoleKey(): string {
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SECRET_KEY");
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is required for storage uploads.");
  }
  return key;
}

function resolveStorageBucket(): string {
  const bucket = readEnv("SUPABASE_STORAGE_BUCKET");
  return bucket && bucket.length > 0 ? bucket : "uploads";
}

function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  let normalized = raw.trim();
  if (!normalized) return null;

  const hasDoubleQuotes = normalized.startsWith("\"") && normalized.endsWith("\"");
  const hasSingleQuotes = normalized.startsWith("'") && normalized.endsWith("'");
  if ((hasDoubleQuotes || hasSingleQuotes) && normalized.length >= 2) {
    normalized = normalized.slice(1, -1).trim();
  }

  // Vercel/CLI 입력에서 끝에 "\n" 문자열이 섞인 경우를 방어한다.
  normalized = normalized.replace(/(?:\\r\\n|\\n|\\r)+$/g, "");
  normalized = normalized.replace(/[\r\n]+$/g, "").trim();

  return normalized || null;
}

function shouldUseLocalUploadFallback(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const fallback = process.env.UPLOAD_LOCAL_FALLBACK?.trim().toLowerCase();
  if (fallback === "0" || fallback === "false" || fallback === "off") return false;
  return true;
}

function normalizeObjectPath(objectPath: string): string[] {
  return objectPath
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..");
}

function getLocalUploadRootAbsolutePath(): string {
  return path.resolve(process.cwd(), "public", LOCAL_UPLOAD_PUBLIC_ROOT);
}

function getLocalUploadAbsolutePath(objectPath: string): string {
  const root = getLocalUploadRootAbsolutePath();
  const segments = normalizeObjectPath(objectPath);
  const absolute = path.resolve(root, ...segments);
  if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
    throw new Error("Invalid upload object path.");
  }
  return absolute;
}

function buildLocalPublicUrl(objectPath: string): string {
  const encodedPath = encodeObjectPath(objectPath);
  return `/${LOCAL_UPLOAD_PUBLIC_ROOT}/${encodedPath}`;
}

async function saveToLocalPublicUploads(objectPath: string, fileBytes: Uint8Array): Promise<void> {
  const absolutePath = getLocalUploadAbsolutePath(objectPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, fileBytes);
}

function encodeObjectPath(objectPath: string): string {
  return objectPath
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function buildSupabasePublicUrl(objectPath: string): string {
  const origin = resolveSupabaseUrl();
  const bucket = resolveStorageBucket();
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = encodeObjectPath(objectPath);
  return `${origin}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

async function uploadToSupabaseStorage(params: {
  objectPath: string;
  body: Blob;
  contentType: string;
}): Promise<void> {
  const origin = resolveSupabaseUrl();
  const serviceRoleKey = resolveServiceRoleKey();
  const bucket = resolveStorageBucket();
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = encodeObjectPath(params.objectPath);
  const uploadUrl = `${origin}/storage/v1/object/${encodedBucket}/${encodedPath}`;

  const sendUpload = async (): Promise<Response> =>
    fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "x-upsert": "false",
        "Content-Type": params.contentType,
      },
      body: params.body,
      cache: "no-store",
    });

  let response = await sendUpload();
  if (response.ok) return;

  const details = await response.text();
  if (response.status === 400 && isBucketNotFoundError(details)) {
    await ensureSupabaseBucketExists({ origin, serviceRoleKey, bucket });
    response = await sendUpload();
    if (response.ok) return;

    const retryDetails = await response.text();
    throw new Error(
      `Supabase Storage 버킷 생성 후에도 이미지 업로드에 실패했습니다. (${response.status}): ${retryDetails}`
    );
  }

  throw new Error(`Supabase Storage 이미지 업로드에 실패했습니다. (${response.status}): ${details}`);
}

function isBucketNotFoundError(details: string): boolean {
  const normalized = details.toLowerCase();
  return normalized.includes("bucket not found");
}

async function ensureSupabaseBucketExists(params: {
  origin: string;
  serviceRoleKey: string;
  bucket: string;
}): Promise<void> {
  const createBucketUrl = `${params.origin}/storage/v1/bucket`;
  const response = await fetch(createBucketUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.serviceRoleKey}`,
      apikey: params.serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: params.bucket,
      name: params.bucket,
      public: true,
    }),
    cache: "no-store",
  });

  if (response.ok || response.status === 409) {
    return;
  }

  const details = await response.text();
  throw new Error(
    `Supabase Storage 버킷 '${params.bucket}' 생성에 실패했습니다. (${response.status}): ${details}`
  );
}

function parseSupabaseObjectFromPublicUrl(publicUrl: string): { bucket: string; objectPath: string } | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(publicUrl);
  } catch {
    return null;
  }

  const marker = "/storage/v1/object/public/";
  const markerIndex = parsedUrl.pathname.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const rest = parsedUrl.pathname.slice(markerIndex + marker.length);
  const segments = rest.split("/").filter((part) => part.length > 0);
  if (segments.length < 2) {
    return null;
  }

  const [bucketSegment, ...pathSegments] = segments;
  const bucket = decodeURIComponent(bucketSegment);
  const objectPath = pathSegments.map((segment) => decodeURIComponent(segment)).join("/");
  if (!bucket || !objectPath) {
    return null;
  }

  return { bucket, objectPath };
}

export async function deleteUploadedFileByPublicUrl(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl) return;

  const localObjectPath = parseLocalObjectPathFromPublicUrl(publicUrl);
  if (localObjectPath) {
    const localPath = getLocalUploadAbsolutePath(localObjectPath);
    try {
      await unlink(localPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }

  const parsed = parseSupabaseObjectFromPublicUrl(publicUrl);
  if (!parsed) return;

  const origin = resolveSupabaseUrl();
  const serviceRoleKey = resolveServiceRoleKey();
  const encodedBucket = encodeURIComponent(parsed.bucket);
  const deleteUrl = `${origin}/storage/v1/object/${encodedBucket}`;

  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([parsed.objectPath]),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Supabase Storage 이미지 삭제에 실패했습니다. (${response.status}): ${details}`
    );
  }
}

function parseLocalObjectPathFromPublicUrl(publicUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(publicUrl);
  } catch {
    parsed = new URL(publicUrl, "http://localhost");
  }

  const marker = `/${LOCAL_UPLOAD_PUBLIC_ROOT}/`;
  if (!parsed.pathname.startsWith(marker)) {
    return null;
  }

  const rest = parsed.pathname.slice(marker.length);
  const segments = rest
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
  if (segments.length < 1) return null;

  return segments.join("/");
}
