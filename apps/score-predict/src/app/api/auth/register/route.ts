import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/password-recovery";
import { validateRegisterInput as validatePoliceRegisterInput } from "@/lib/police/validations";
import { prisma } from "@/lib/prisma";
import { getServerTenantType } from "@/lib/tenant.server";
import { validateRegisterInput as validateFireRegisterInput } from "@/lib/validations";

export const runtime = "nodejs";

interface FireRegisterRequestBody {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  password?: unknown;
  agreedToTerms?: unknown;
  agreedToPrivacy?: unknown;
}

interface PoliceRegisterRequestBody {
  name?: unknown;
  username?: unknown;
  contactPhone?: unknown;
  email?: unknown;
  password?: unknown;
  agreeToTerms?: unknown;
  agreeToPrivacy?: unknown;
}

let hasUserContactPhoneColumnCache: boolean | null = null;

function isMissingContactPhoneColumnError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    String(error.meta?.column ?? "").includes("contactPhone")
  );
}

async function hasUserContactPhoneColumn() {
  if (hasUserContactPhoneColumnCache !== null) {
    return hasUserContactPhoneColumnCache;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'User'
          AND column_name = 'contactPhone'
      ) AS "exists"
    `;

    hasUserContactPhoneColumnCache = rows[0]?.exists === true;
  } catch {
    hasUserContactPhoneColumnCache = true;
  }

  return hasUserContactPhoneColumnCache;
}

async function createLegacyUser(params: {
  name: string;
  email: string | null;
  phone: string;
  hashedPassword: string;
  now: Date;
}) {
  const inserted = await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "User" ("name", "email", "phone", "password", "role", "createdAt", "termsAgreedAt", "privacyAgreedAt")
    VALUES (${params.name}, ${params.email}, ${params.phone}, ${params.hashedPassword}, 'USER', ${params.now}, ${params.now}, ${params.now})
    RETURNING "id"
  `;

  const created = inserted[0];
  if (!created?.id) {
    throw new Error("레거시 사용자 스키마에 회원 생성에 실패했습니다.");
  }

  hasUserContactPhoneColumnCache = false;
  return created.id;
}

async function handleFireRegister(body: FireRegisterRequestBody) {
  const validationResult = validateFireRegisterInput({
    name: typeof body.name === "string" ? body.name : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    phone: typeof body.phone === "string" ? body.phone : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    agreedToTerms: body.agreedToTerms === true,
    agreedToPrivacy: body.agreedToPrivacy === true,
  });

  if (!validationResult.isValid || !validationResult.data) {
    return NextResponse.json(
      { error: validationResult.errors[0], errors: validationResult.errors },
      { status: 400 }
    );
  }

  const { name, email, phone, password } = validationResult.data;

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ phone }, ...(email ? [{ email }] : [])],
    },
    select: { phone: true, email: true },
  });
  if (existingUser) {
    if (existingUser.phone === phone) {
      return NextResponse.json({ error: "이미 등록된 연락처입니다." }, { status: 409 });
    }

    if (email && existingUser.email === email) {
      return NextResponse.json({ error: "이미 등록된 이메일입니다." }, { status: 409 });
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const recoveryCodes = generateRecoveryCodes(8);
  const now = new Date();

  let createdUserId: number;

  const supportsContactPhoneColumn = await hasUserContactPhoneColumn();
  if (!supportsContactPhoneColumn) {
    createdUserId = await createLegacyUser({
      name,
      email: email ?? null,
      phone,
      hashedPassword,
      now,
    });
  } else {
    try {
      const created = await prisma.user.create({
        data: {
          name,
          email,
          phone,
          password: hashedPassword,
          termsAgreedAt: now,
          privacyAgreedAt: now,
        },
        select: { id: true },
      });
      createdUserId = created.id;
    } catch (error) {
      if (!isMissingContactPhoneColumnError(error)) {
        throw error;
      }

      createdUserId = await createLegacyUser({
        name,
        email: email ?? null,
        phone,
        hashedPassword,
        now,
      });
    }
  }

  try {
    await prisma.recoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        userId: createdUserId,
        codeHash: hashRecoveryCode(code),
      })),
    });
  } catch (error) {
    await prisma.user.delete({ where: { id: createdUserId } }).catch(() => undefined);
    throw error;
  }

  return NextResponse.json(
    {
      success: true,
      message: "회원가입이 완료되었습니다.",
      recoveryCodes,
    },
    { status: 201 }
  );
}

async function handlePoliceRegister(body: PoliceRegisterRequestBody) {
  const validationResult = validatePoliceRegisterInput({
    name: typeof body.name === "string" ? body.name : undefined,
    username: typeof body.username === "string" ? body.username : undefined,
    contactPhone: typeof body.contactPhone === "string" ? body.contactPhone : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    agreeToTerms: body.agreeToTerms === true,
    agreeToPrivacy: body.agreeToPrivacy === true,
  });

  if (!validationResult.isValid || !validationResult.data) {
    return NextResponse.json(
      { error: validationResult.errors[0], errors: validationResult.errors },
      { status: 400 }
    );
  }

  const { name, username, contactPhone, email, password } = validationResult.data;

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: username },
        ...(email ? [{ email }] : []),
      ],
    },
    select: { phone: true, email: true },
  });

  if (existingUser) {
    if (existingUser.phone === username) {
      return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
    }

    if (email && existingUser.email === email) {
      return NextResponse.json({ error: "이미 등록된 이메일입니다." }, { status: 409 });
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const now = new Date();
  const supportsContactPhoneColumn = await hasUserContactPhoneColumn();

  if (!supportsContactPhoneColumn) {
    await createLegacyUser({
      name,
      email,
      phone: username,
      hashedPassword,
      now,
    });
  } else {
    try {
      await prisma.user.create({
        data: {
          name,
          email,
          phone: username,
          contactPhone,
          password: hashedPassword,
          termsAgreedAt: now,
          privacyAgreedAt: now,
        },
      });
    } catch (error) {
      if (!isMissingContactPhoneColumnError(error)) {
        throw error;
      }

      await createLegacyUser({
        name,
        email,
        phone: username,
        hashedPassword,
        now,
      });
    }
  }

  return NextResponse.json(
    {
      success: true,
      message: "회원가입이 완료되었습니다.",
    },
    { status: 201 }
  );
}

export async function POST(request: Request) {
  try {
    const tenantType = await getServerTenantType();
    const body = (await request.json()) as FireRegisterRequestBody | PoliceRegisterRequestBody;

    if (tenantType === "police") {
      return handlePoliceRegister(body as PoliceRegisterRequestBody);
    }

    return handleFireRegister(body as FireRegisterRequestBody);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "이미 등록된 연락처 또는 이메일입니다." },
        { status: 409 }
      );
    }

    console.error("회원가입 처리 중 오류가 발생했습니다.", error);
    return NextResponse.json(
      { error: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
