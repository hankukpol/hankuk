import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_TENANT_TYPE, TENANT_TYPES, type TenantType } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";

const SCHEMA_BY_TENANT: Record<TenantType, string> = {
  fire: "score_predict_fire",
  police: "score_predict_police",
};

const TENANT_BY_SCHEMA = new Map<string, TenantType>(
  Object.entries(SCHEMA_BY_TENANT).map(([tenantType, schema]) => [schema, tenantType as TenantType])
);

const RETRYABLE_CONNECTION_ERROR_CODES = new Set(["P1001", "P1008", "P1011", "P1017"]);

const globalForPrisma = globalThis as unknown as {
  prismaClients?: Partial<Record<TenantType, PrismaClient>>;
};

function normalizeTenantType(value: string | null | undefined): TenantType | null {
  if (value === "fire" || value === "police") {
    return value;
  }

  return null;
}

function readSchemaFromUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).searchParams.get("schema");
  } catch {
    return null;
  }
}

function replaceSchemaInUrl(url: string | undefined, schema: string): string {
  if (!url) {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function resolveExplicitTenantType(): TenantType | null {
  const explicitTenant = normalizeTenantType(process.env.SCORE_PREDICT_TENANT);
  if (explicitTenant) {
    return explicitTenant;
  }

  const explicitSchema = process.env.SCORE_PREDICT_PRISMA_SCHEMA;
  if (explicitSchema) {
    return TENANT_BY_SCHEMA.get(explicitSchema) ?? null;
  }

  return null;
}

function resolveTenantTypeFromDatabaseUrls(): TenantType | null {
  const schemaFromDirectUrl = readSchemaFromUrl(process.env.DIRECT_URL);
  if (schemaFromDirectUrl) {
    return TENANT_BY_SCHEMA.get(schemaFromDirectUrl) ?? null;
  }

  const schemaFromDatabaseUrl = readSchemaFromUrl(process.env.DATABASE_URL);
  if (schemaFromDatabaseUrl) {
    return TENANT_BY_SCHEMA.get(schemaFromDatabaseUrl) ?? null;
  }

  return null;
}

function createTenantClient(tenantType: TenantType) {
  return new PrismaClient({
    datasources: {
      db: {
        url: replaceSchemaInUrl(process.env.DATABASE_URL, SCHEMA_BY_TENANT[tenantType]),
      },
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getTenantClient(tenantType: TenantType): PrismaClient {
  const clients = (globalForPrisma.prismaClients ??= {});
  if (!clients[tenantType]) {
    clients[tenantType] = createTenantClient(tenantType);
  }

  return clients[tenantType]!;
}

async function resolveTenantType(): Promise<TenantType> {
  const explicitTenant = resolveExplicitTenantType();
  if (explicitTenant) {
    return explicitTenant;
  }

  try {
    return await getServerTenantType();
  } catch {
    const tenantFromDatabaseUrls = resolveTenantTypeFromDatabaseUrls();
    if (tenantFromDatabaseUrls) {
      return tenantFromDatabaseUrls;
    }

    return DEFAULT_TENANT_TYPE;
  }
}

async function resolveTenantClient(): Promise<PrismaClient> {
  return getTenantClient(await resolveTenantType());
}

async function disconnectAllPrismaClients() {
  const clients = globalForPrisma.prismaClients;
  if (!clients) {
    return;
  }

  await Promise.all(
    TENANT_TYPES.map(async (tenantType) => {
      const client = clients[tenantType];
      if (!client) {
        return;
      }

      await client.$disconnect().catch(() => undefined);
    })
  );
}

function createModelDelegateProxy(modelName: string) {
  return new Proxy(
    {},
    {
      get(_target, methodName) {
        if (typeof methodName !== "string") {
          return undefined;
        }

        return async (...args: unknown[]) => {
          const client = await resolveTenantClient();
          const delegate = (client as unknown as Record<string, unknown>)[modelName] as
            | Record<string, unknown>
            | undefined;
          const method = delegate?.[methodName];

          if (typeof method !== "function") {
            throw new Error(`Prisma delegate ${modelName}.${methodName} is not available.`);
          }

          return Reflect.apply(method, delegate, args);
        };
      },
    }
  );
}

const prismaProxy = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      if (property === "$disconnect") {
        return disconnectAllPrismaClients;
      }

      if (property === "$connect") {
        return async () => {
          await Promise.all(TENANT_TYPES.map(async (tenantType) => getTenantClient(tenantType).$connect()));
        };
      }

      if (property === "$transaction") {
        return async (...args: unknown[]) => {
          const client = await resolveTenantClient();
          const [firstArg, secondArg] = args;

          if (Array.isArray(firstArg)) {
            throw new Error(
              "Tenant-aware Prisma does not support array-style $transaction. Use callback-style transactions."
            );
          }

          if (typeof firstArg === "function") {
            return client.$transaction(firstArg as Parameters<PrismaClient["$transaction"]>[0], secondArg as never);
          }

          return client.$transaction(firstArg as never, secondArg as never);
        };
      }

      if (
        property === "$queryRaw" ||
        property === "$executeRaw" ||
        property === "$queryRawUnsafe" ||
        property === "$executeRawUnsafe"
      ) {
        return async (...args: unknown[]) => {
          const client = await resolveTenantClient();
          const method = (client as unknown as Record<string, (...methodArgs: unknown[]) => Promise<unknown>>)[
            property
          ];
          return Reflect.apply(method, client, args);
        };
      }

      return createModelDelegateProxy(property);
    },
  }
);

export const prisma = prismaProxy as PrismaClient;

export function getPrismaClientForTenant(tenantType: TenantType): PrismaClient {
  return getTenantClient(tenantType);
}

function isRetryablePrismaConnectionError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    RETRYABLE_CONNECTION_ERROR_CODES.has(error.code)
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withPrismaConnectionRetry<T>(
  operation: () => Promise<T>,
  label = "prisma operation"
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryablePrismaConnectionError(error)) {
      throw error;
    }

    console.warn(`${label} hit a transient Prisma connection error (${error.code}). Retrying once.`);
    await disconnectAllPrismaClients();
    await wait(150);
    return operation();
  }
}
