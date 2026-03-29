import { getAcademyById, resolveAcademyByHostname } from "@/lib/academy";
import { getAcademySettingsByAcademyId } from "@/lib/academy-settings";
import { hasDatabaseConfig } from "@/lib/env";

export const DEFAULT_ACADEMY_THEME_COLOR = "#C55A11";
export const DEFAULT_SYSTEM_NAME = "학원 통합 운영 시스템";
export const DEFAULT_STUDENT_PORTAL_NAME = `${DEFAULT_SYSTEM_NAME} 학생 포털`;
export const DEFAULT_CONTACT_FALLBACK = "학원 연락처는 관리자에게 문의해 주세요.";
export const DEFAULT_ADDRESS_FALLBACK = "학원 주소는 관리자에게 문의해 주세요.";
export const DEFAULT_DIRECTOR_FALLBACK = "학원장";
export const DEFAULT_CONTACT_HOURS = "평일 09:00~21:00, 주말 09:00~18:00";

export type AcademyRuntimeBranding = {
  academyId: number | null;
  academyName: string;
  systemName: string;
  studentPortalName: string;
  systemDescription: string;
  studentPortalDescription: string;
  themeColor: string;
  address: string | null;
  phone: string | null;
  phoneHref: string | null;
  directorName: string | null;
  businessRegNo: string | null;
  contactLine: string | null;
  englishBrandName: string;
};

function joinTruthy(
  values: Array<string | null | undefined>,
  separator = " · ",
) {
  return values
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim())
    .join(separator);
}

function sanitizePhoneHref(phone: string | null) {
  if (!phone) {
    return null;
  }

  const normalized = phone.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
}

export async function getAcademyRuntimeBranding(
  academyId?: number | null,
): Promise<AcademyRuntimeBranding> {
  const canResolveAcademy = hasDatabaseConfig();
  const resolvedAcademyId = !canResolveAcademy
    ? academyId ?? null
    : academyId === undefined
      ? await resolveAcademyByHostname()
      : academyId;

  const [academy, academySettings] =
    canResolveAcademy && resolvedAcademyId !== null
      ? await Promise.all([
          getAcademyById(resolvedAcademyId),
          getAcademySettingsByAcademyId(resolvedAcademyId),
        ])
      : [null, null];

  const academyName =
    academySettings?.name?.trim() ||
    academy?.name?.trim() ||
    DEFAULT_SYSTEM_NAME;
  const systemName =
    academyName === DEFAULT_SYSTEM_NAME
      ? academyName
      : `${academyName} 관리 시스템`;
  const studentPortalName =
    academyName === DEFAULT_SYSTEM_NAME
      ? DEFAULT_STUDENT_PORTAL_NAME
      : `${academyName} 학생 포털`;
  const systemDescription =
    academyName === DEFAULT_SYSTEM_NAME
      ? "수납, 수강, 성적, 출결, 시설을 관리하는 학원 통합 운영 시스템입니다."
      : `${academyName}의 수납, 수강, 성적, 출결, 시설을 관리하는 통합 운영 시스템입니다.`;
  const studentPortalDescription =
    academyName === DEFAULT_SYSTEM_NAME
      ? "학생 포털에서 성적, 공지, 수강 정보를 확인할 수 있습니다."
      : `${academyName} 학생 포털에서 성적, 공지, 수강 정보를 확인할 수 있습니다.`;
  const themeColor =
    academy?.themeColor?.trim() || DEFAULT_ACADEMY_THEME_COLOR;
  const address = academySettings?.address?.trim() || null;
  const phone = academySettings?.phone?.trim() || null;

  return {
    academyId: resolvedAcademyId,
    academyName,
    systemName,
    studentPortalName,
    systemDescription,
    studentPortalDescription,
    themeColor,
    address,
    phone,
    phoneHref: sanitizePhoneHref(phone),
    directorName: academySettings?.directorName?.trim() || null,
    businessRegNo: academySettings?.businessRegNo?.trim() || null,
    contactLine: joinTruthy([address, phone]),
    englishBrandName: "ACADEMY OPS",
  };
}

export function getAcademyAddress(
  branding: Pick<AcademyRuntimeBranding, "address">,
  fallback = DEFAULT_ADDRESS_FALLBACK,
) {
  return branding.address?.trim() || fallback;
}

export function getAcademyPhone(
  branding: Pick<AcademyRuntimeBranding, "phone">,
  fallback = DEFAULT_CONTACT_FALLBACK,
) {
  return branding.phone?.trim() || fallback;
}

export function getAcademyContactLine(
  branding: Pick<AcademyRuntimeBranding, "contactLine" | "address" | "phone">,
  fallback = DEFAULT_CONTACT_FALLBACK,
) {
  return branding.contactLine?.trim()
    || joinTruthy([branding.address, branding.phone])
    || fallback;
}

export function getAcademyPhoneWithHours(
  branding: Pick<AcademyRuntimeBranding, "phone">,
  hours = DEFAULT_CONTACT_HOURS,
) {
  const phone = branding.phone?.trim();
  return phone ? `${phone} · ${hours}` : DEFAULT_CONTACT_FALLBACK;
}

export function getAcademyDirectorName(
  branding: Pick<AcademyRuntimeBranding, "directorName">,
  fallback = DEFAULT_DIRECTOR_FALLBACK,
) {
  return branding.directorName?.trim() || fallback;
}

export function getAcademyIssuerName(
  branding: Pick<AcademyRuntimeBranding, "academyName" | "directorName">,
) {
  return branding.directorName?.trim() || `${branding.academyName}장`;
}
