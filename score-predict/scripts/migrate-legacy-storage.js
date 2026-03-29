#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const TARGET_PROJECT_ORIGIN =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const TARGET_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const TARGET_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

const SCHEMA_BY_TENANT = {
  fire: "score_predict_fire",
  police: "score_predict_police",
};

const LEGACY_HOSTS = new Set([
  "iqhkmcxeuwueiqopkwfd.supabase.co",
  "qsdufgjxepzvgkrcumcq.supabase.co",
]);

function readDatabaseUrlBase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(databaseUrl);
  parsed.searchParams.set("schema", "");
  return parsed.toString();
}

function ensureEnv() {
  if (!TARGET_PROJECT_ORIGIN) {
    throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required.");
  }

  if (!TARGET_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required.");
  }
}

function createPrismaClient(schema) {
  const base = readDatabaseUrlBase();
  return new PrismaClient({
    datasources: {
      db: {
        url: `${base}${schema}`,
      },
    },
  });
}

function parseLegacyPublicUrl(publicUrl) {
  let parsed;
  try {
    parsed = new URL(publicUrl);
  } catch {
    return null;
  }

  if (!LEGACY_HOSTS.has(parsed.host)) {
    return null;
  }

  const marker = "/storage/v1/object/public/";
  const markerIndex = parsed.pathname.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const rest = parsed.pathname.slice(markerIndex + marker.length);
  const [bucket, ...segments] = rest.split("/").filter(Boolean);
  if (!bucket || segments.length === 0) {
    return null;
  }

  return {
    sourceUrl: publicUrl,
    host: parsed.host,
    bucket: decodeURIComponent(bucket),
    objectPath: segments.map((segment) => decodeURIComponent(segment)).join("/"),
  };
}

function buildTargetObjectPath(tenantType, objectPath) {
  return ["legacy", tenantType, ...objectPath.split("/").filter(Boolean)].join("/");
}

function buildTargetPublicUrl(objectPath) {
  const origin = new URL(TARGET_PROJECT_ORIGIN).origin;
  const encodedBucket = encodeURIComponent(TARGET_BUCKET);
  const encodedPath = objectPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${origin}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

async function uploadToTargetStorage(targetObjectPath, bytes, contentType) {
  const origin = new URL(TARGET_PROJECT_ORIGIN).origin;
  const uploadUrl = `${origin}/storage/v1/object/${encodeURIComponent(TARGET_BUCKET)}/${targetObjectPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TARGET_SERVICE_ROLE_KEY}`,
      apikey: TARGET_SERVICE_ROLE_KEY,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: bytes,
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${await response.text()}`);
  }
}

async function copyLegacyUrl(tenantType, sourceUrl, cache) {
  const parsed = parseLegacyPublicUrl(sourceUrl);
  if (!parsed) {
    return sourceUrl;
  }

  if (cache.has(sourceUrl)) {
    return cache.get(sourceUrl);
  }

  const targetObjectPath = buildTargetObjectPath(tenantType, parsed.objectPath);
  const targetPublicUrl = buildTargetPublicUrl(targetObjectPath);

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Download failed for ${sourceUrl} (${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  await uploadToTargetStorage(targetObjectPath, bytes, contentType);

  cache.set(sourceUrl, targetPublicUrl);
  return targetPublicUrl;
}

function extractLegacyUrlsFromHtml(html) {
  if (!html) {
    return [];
  }

  return [...html.matchAll(/https:\/\/[^\s"'<>]+supabase\.co\/storage\/v1\/object\/public\/[^\s"'<>]+/g)].map(
    (match) => match[0]
  );
}

async function migrateTenant(tenantType, schema) {
  const prisma = createPrismaClient(schema);
  const copyCache = new Map();

  try {
    const banners = await prisma.banner.findMany({
      where: {
        OR: [
          { imageUrl: { contains: "supabase.co/storage/" } },
          { mobileImageUrl: { contains: "supabase.co/storage/" } },
          { htmlContent: { contains: "supabase.co/storage/" } },
        ],
      },
      select: {
        id: true,
        imageUrl: true,
        mobileImageUrl: true,
        htmlContent: true,
      },
    });

    for (const banner of banners) {
      let imageUrl = banner.imageUrl;
      let mobileImageUrl = banner.mobileImageUrl;
      let htmlContent = banner.htmlContent;

      if (imageUrl) {
        imageUrl = await copyLegacyUrl(tenantType, imageUrl, copyCache);
      }

      if (mobileImageUrl) {
        mobileImageUrl = await copyLegacyUrl(tenantType, mobileImageUrl, copyCache);
      }

      if (htmlContent) {
        const legacyUrls = [...new Set(extractLegacyUrlsFromHtml(htmlContent))];
        for (const legacyUrl of legacyUrls) {
          const nextUrl = await copyLegacyUrl(tenantType, legacyUrl, copyCache);
          htmlContent = htmlContent.split(legacyUrl).join(nextUrl);
        }
      }

      await prisma.banner.update({
        where: { id: banner.id },
        data: {
          imageUrl,
          mobileImageUrl,
          htmlContent,
        },
      });
    }

    const remainingLegacy = await prisma.banner.count({
      where: {
        OR: [
          { imageUrl: { contains: "iqhkmcxeuwueiqopkwfd.supabase.co" } },
          { imageUrl: { contains: "qsdufgjxepzvgkrcumcq.supabase.co" } },
          { mobileImageUrl: { contains: "iqhkmcxeuwueiqopkwfd.supabase.co" } },
          { mobileImageUrl: { contains: "qsdufgjxepzvgkrcumcq.supabase.co" } },
          { htmlContent: { contains: "iqhkmcxeuwueiqopkwfd.supabase.co" } },
          { htmlContent: { contains: "qsdufgjxepzvgkrcumcq.supabase.co" } },
        ],
      },
    });

    return {
      tenantType,
      schema,
      migratedBanners: banners.length,
      copiedAssets: copyCache.size,
      remainingLegacyUrls: remainingLegacy,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  ensureEnv();

  const summaries = [];
  for (const [tenantType, schema] of Object.entries(SCHEMA_BY_TENANT)) {
    summaries.push(await migrateTenant(tenantType, schema));
  }

  console.log(JSON.stringify({ summaries }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
