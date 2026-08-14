import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { requireSoleActiveExam } from "@/lib/active-exam";
import { prisma } from "@/lib/prisma";
import { saveImageUpload, validateImageFile } from "@/lib/upload";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("promotions");
  if (featureError) return featureError;
  try {
    const form = await request.formData();
    const campaignId = Number(form.get("campaignId"));
    const slot = String(form.get("slot") ?? "image").trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64);
    const file = form.get("image");
    if (!Number.isInteger(campaignId) || campaignId < 1 || !(file instanceof File) || !slot) {
      return NextResponse.json({ error: "캠페인, 이미지 슬롯 또는 파일이 올바르지 않습니다." }, { status: 400 });
    }
    const validation = await validateImageFile(file);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    const activeExam = await requireSoleActiveExam({ db: prisma, tenantType: guard.tenantType, context: "admin/promotions:upload" });
    const campaign = await prisma.promotionCampaign.findFirst({ where: { id: campaignId, examId: activeExam.id, tenantType: guard.tenantType, archivedAt: null }, select: { id: true } });
    if (!campaign) return NextResponse.json({ error: "현재 회차의 수정 가능한 캠페인을 찾을 수 없습니다." }, { status: 404 });
    const saved = await saveImageUpload({
      file,
      prefix: slot,
      uploadSubdir: `promotions/${guard.tenantType}/${activeExam.id}/${campaign.id}/${slot}`,
    });
    return NextResponse.json({ success: true, imageUrl: saved.publicUrl, objectPath: saved.objectPath });
  } catch (error) {
    console.error("프로모션 이미지 업로드 실패", error);
    return NextResponse.json({ error: "이미지 업로드에 실패했습니다." }, { status: 500 });
  }
}
