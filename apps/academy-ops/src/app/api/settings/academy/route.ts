import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { upsertAcademySettingsByAcademyId } from "@/lib/academy-settings";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (auth.context.activeAcademyId === null) {
    return NextResponse.json({ error: "지점을 먼저 선택해 주세요." }, { status: 400 });
  }

  const settings = await getPrisma().academySettings.findUnique({
    where: { academyId: auth.context.activeAcademyId },
  });
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (auth.context.activeAcademyId === null) {
    return NextResponse.json({ error: "지점을 먼저 선택해 주세요." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const {
      name,
      directorName,
      businessRegNo,
      academyRegNo,
      address,
      phone,
      faxNumber,
      bankName,
      bankAccount,
      bankHolder,
      websiteUrl,
      documentIssuer,
      sealImagePath,
      logoImagePath,
    } = body;

    const data: Record<string, string> = {
      name: name?.trim() ?? "",
      directorName: directorName?.trim() ?? "",
      businessRegNo: businessRegNo?.trim() ?? "",
      academyRegNo: academyRegNo?.trim() ?? "",
      address: address?.trim() ?? "",
      phone: phone?.trim() ?? "",
      faxNumber: faxNumber?.trim() ?? "",
      bankName: bankName?.trim() ?? "",
      bankAccount: bankAccount?.trim() ?? "",
      bankHolder: bankHolder?.trim() ?? "",
      websiteUrl: websiteUrl?.trim() ?? "",
      documentIssuer: documentIssuer?.trim() ?? "",
      sealImagePath: sealImagePath?.trim() ?? "",
      logoImagePath: logoImagePath?.trim() ?? "",
    };

    const settings = await upsertAcademySettingsByAcademyId(auth.context.activeAcademyId, data);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "설정 저장에 실패했습니다." },
      { status: 400 },
    );
  }
}