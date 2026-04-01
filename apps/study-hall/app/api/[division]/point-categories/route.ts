import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import {
  pointCategoryCreateSchema,
  pointCategoryDeleteSchema,
  pointCategoryRenameSchema,
} from "@/lib/point-schemas";
import {
  createPointCategory,
  deletePointCategory,
  listPointCategories,
  renamePointCategory,
  supportsPointCategoryCustomization,
} from "@/lib/services/point.service";

async function requirePointCategoryAccess(divisionSlug: string) {
  const auth = await requireApiAuth(divisionSlug, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    divisionSlug,
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { division: string } },
) {
  const denied = await requirePointCategoryAccess(params.division);

  if (denied) {
    return denied;
  }

  try {
    const [categories, customizationEnabled] = await Promise.all([
      listPointCategories(params.division),
      supportsPointCategoryCustomization(),
    ]);

    return NextResponse.json(
      { categories, customizationEnabled },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    return toApiErrorResponse(
      error,
      "상벌점 카테고리 처리 중 오류가 발생했습니다.",
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const denied = await requirePointCategoryAccess(params.division);

  if (denied) {
    return denied;
  }

  const body = await request.json().catch(() => null);
  const parsed = pointCategoryCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: getZodErrorMessage(
          parsed.error,
          "카테고리 정보를 다시 확인해 주세요.",
        ),
      },
      { status: 400 },
    );
  }

  try {
    const categories = await createPointCategory(params.division, parsed.data.name);
    return NextResponse.json({ categories }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(
      error,
      "상벌점 카테고리 처리 중 오류가 발생했습니다.",
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const denied = await requirePointCategoryAccess(params.division);

  if (denied) {
    return denied;
  }

  const body = await request.json().catch(() => null);
  const parsed = pointCategoryRenameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: getZodErrorMessage(
          parsed.error,
          "카테고리 정보를 다시 확인해 주세요.",
        ),
      },
      { status: 400 },
    );
  }

  try {
    const categories = await renamePointCategory(
      params.division,
      parsed.data.currentName,
      parsed.data.nextName,
    );
    return NextResponse.json({ categories });
  } catch (error) {
    return toApiErrorResponse(
      error,
      "상벌점 카테고리 처리 중 오류가 발생했습니다.",
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const denied = await requirePointCategoryAccess(params.division);

  if (denied) {
    return denied;
  }

  const body = await request.json().catch(() => null);
  const parsed = pointCategoryDeleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: getZodErrorMessage(
          parsed.error,
          "카테고리 정보를 다시 확인해 주세요.",
        ),
      },
      { status: 400 },
    );
  }

  try {
    const categories = await deletePointCategory(params.division, parsed.data.name);
    return NextResponse.json({ categories });
  } catch (error) {
    return toApiErrorResponse(
      error,
      "상벌점 카테고리 처리 중 오류가 발생했습니다.",
    );
  }
}
