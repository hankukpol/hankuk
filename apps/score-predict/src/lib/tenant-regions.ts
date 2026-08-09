import { FIRE_REGION_ORDER } from "@/lib/fire/regions";
import { POLICE_REGION_ORDER } from "@/lib/police/regions";
import type { TenantType } from "@/lib/tenant";

export function getTenantRegionOrder(tenantType: TenantType, name: string): number {
  const order = tenantType === "police" ? POLICE_REGION_ORDER : FIRE_REGION_ORDER;
  const index = order.findIndex((keyword) => name.includes(keyword));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function sortTenantRegions<T extends { name: string }>(
  tenantType: TenantType,
  regions: readonly T[]
): T[] {
  return [...regions].sort((left, right) => {
    const orderDiff =
      getTenantRegionOrder(tenantType, left.name) - getTenantRegionOrder(tenantType, right.name);
    return orderDiff !== 0 ? orderDiff : left.name.localeCompare(right.name, "ko-KR");
  });
}
