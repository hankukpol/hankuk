import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [settings, tenantType] = await Promise.all([
      getSiteSettingsUncached(),
      getServerTenantType(),
    ]);
    const faqEnabled = Boolean(settings["site.tabFaqEnabled"] ?? true);

    if (!faqEnabled) {
      return NextResponse.json({ faqs: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const faqs = await prisma.faq.findMany({
      where: {
        tenantType,
        isActive: true,
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        question: true,
        answer: true,
        priority: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        faqs: faqs.map((item) => ({
          ...item,
          updatedAt: item.updatedAt.toISOString(),
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("FAQ 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "FAQ 조회에 실패했습니다." }, { status: 500 });
  }
}
