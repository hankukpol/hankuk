import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getAcademySettingsByAcademyId } from "@/lib/academy-settings";
import { AcademySettingsForm } from "./academy-settings-form";

export const dynamic = "force-dynamic";

export type AcademySettingsRow = {
  name: string;
  directorName: string;
  businessRegNo: string;
  academyRegNo: string;
  address: string;
  phone: string;
  faxNumber: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  websiteUrl: string;
  documentIssuer: string;
  sealImagePath: string;
  logoImagePath: string;
};

export default async function AcademySettingsPage() {
  const context = await requireAdminContext(AdminRole.MANAGER);

  if (context.activeAcademyId === null) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          지점 선택 필요
        </div>
        <h1 className="mt-5 text-3xl font-semibold">지점 기본 정보는 지점을 선택한 뒤 수정할 수 있습니다.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          슈퍼관리자는 상단 지점 전환 드롭다운에서 특정 지점을 선택한 뒤 설정을 수정해 주세요.
        </p>
      </div>
    );
  }

  const settings = await getAcademySettingsByAcademyId(context.activeAcademyId);

  const row: AcademySettingsRow = {
    name: settings?.name ?? "",
    directorName: settings?.directorName ?? "",
    businessRegNo: settings?.businessRegNo ?? "",
    academyRegNo: settings?.academyRegNo ?? "",
    address: settings?.address ?? "",
    phone: settings?.phone ?? "",
    faxNumber: settings?.faxNumber ?? "",
    bankName: settings?.bankName ?? "",
    bankAccount: settings?.bankAccount ?? "",
    bankHolder: settings?.bankHolder ?? "",
    websiteUrl: settings?.websiteUrl ?? "",
    documentIssuer: settings?.documentIssuer ?? "",
    sealImagePath: settings?.sealImagePath ?? "",
    logoImagePath: settings?.logoImagePath ?? "",
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학원 기본 정보</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학원 이름, 원장 정보, 사업자 및 등록번호 등 기본 정보를 설정합니다.
        저장된 정보는 각 지점의 증명서, 계약서, 납부 문서에 공통으로 반영됩니다.
      </p>
      <div className="mt-8 max-w-2xl">
        <AcademySettingsForm initialSettings={row} />
      </div>
    </div>
  );
}