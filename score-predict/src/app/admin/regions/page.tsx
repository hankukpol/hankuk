"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import useConfirmModal from "@/hooks/useConfirmModal";
import { Button } from "@/components/ui/button";
import { withTenantPrefix } from "@/lib/tenant";

interface ExamItem {
  id: number;
  name: string;
  year: number;
  round: number;
  isActive: boolean;
  examDate?: string;
}

interface RegionItem {
  id: number;
  name: string;
  isActive: boolean;
  recruitPublicMale: number;
  recruitPublicFemale: number;
  recruitRescue: number;
  recruitAcademicMale: number;
  recruitAcademicFemale: number;
  recruitAcademicCombined: number;
  recruitEmtMale: number;
  recruitEmtFemale: number;
  applicantPublicMale: number | null;
  applicantPublicFemale: number | null;
  applicantRescue: number | null;
  applicantAcademicMale: number | null;
  applicantAcademicFemale: number | null;
  applicantAcademicCombined: number | null;
  applicantEmtMale: number | null;
  applicantEmtFemale: number | null;
  examNumberStartPublicMale: string | null;
  examNumberEndPublicMale: string | null;
  examNumberStartPublicFemale: string | null;
  examNumberEndPublicFemale: string | null;
  examNumberStartCareerRescue: string | null;
  examNumberEndCareerRescue: string | null;
  examNumberStartCareerAcademicMale: string | null;
  examNumberEndCareerAcademicMale: string | null;
  examNumberStartCareerAcademicFemale: string | null;
  examNumberEndCareerAcademicFemale: string | null;
  examNumberStartCareerAcademicCombined: string | null;
  examNumberEndCareerAcademicCombined: string | null;
  examNumberStartCareerEmtMale: string | null;
  examNumberEndCareerEmtMale: string | null;
  examNumberStartCareerEmtFemale: string | null;
  examNumberEndCareerEmtFemale: string | null;
  submissionCount: number;
  submissionCountPublic: number;
  submissionCountCareerRescue: number;
  submissionCountCareerAcademic: number;
  submissionCountCareerEmt: number;
}

interface RegionsResponse {
  exams: ExamItem[];
  selectedExamId: number | null;
  regions: RegionItem[];
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

type EditableRegionItem = Pick<
  RegionItem,
  | "id"
  | "name"
  | "isActive"
  | "recruitPublicMale"
  | "recruitPublicFemale"
  | "recruitRescue"
  | "recruitAcademicMale"
  | "recruitAcademicFemale"
  | "recruitAcademicCombined"
  | "recruitEmtMale"
  | "recruitEmtFemale"
  | "applicantPublicMale"
  | "applicantPublicFemale"
  | "applicantRescue"
  | "applicantAcademicMale"
  | "applicantAcademicFemale"
  | "applicantAcademicCombined"
  | "applicantEmtMale"
  | "applicantEmtFemale"
  | "examNumberStartPublicMale"
  | "examNumberEndPublicMale"
  | "examNumberStartPublicFemale"
  | "examNumberEndPublicFemale"
  | "examNumberStartCareerRescue"
  | "examNumberEndCareerRescue"
  | "examNumberStartCareerAcademicMale"
  | "examNumberEndCareerAcademicMale"
  | "examNumberStartCareerAcademicFemale"
  | "examNumberEndCareerAcademicFemale"
  | "examNumberStartCareerAcademicCombined"
  | "examNumberEndCareerAcademicCombined"
  | "examNumberStartCareerEmtMale"
  | "examNumberEndCareerEmtMale"
  | "examNumberStartCareerEmtFemale"
  | "examNumberEndCareerEmtFemale"
  | "submissionCount"
  | "submissionCountPublic"
  | "submissionCountCareerRescue"
  | "submissionCountCareerAcademic"
  | "submissionCountCareerEmt"
>;

type RegionTabKey = "PUBLIC_MALE" | "PUBLIC_FEMALE" | "CAREER_RESCUE" | "CAREER_ACADEMIC_MALE" | "CAREER_ACADEMIC_FEMALE" | "CAREER_ACADEMIC_COMBINED" | "CAREER_EMT_MALE" | "CAREER_EMT_FEMALE";

function getPassMultipleText(recruitCount: number, tabKey: RegionTabKey): string {
  if (!Number.isInteger(recruitCount) || recruitCount <= 0) return "-";
  const isPublic = tabKey === "PUBLIC_MALE" || tabKey === "PUBLIC_FEMALE";
  if (isPublic) {
    // 소방 공채 배수
    if (recruitCount >= 51) return "1.5배";
    if (recruitCount >= 21) return "2배";
    if (recruitCount >= 11) return "2.5배";
    return "3배";
  }
  // 소방 경채 배수 (구조, 소방학과, 구급 모두 동일)
  if (recruitCount >= 51) return "1.5배";
  if (recruitCount >= 6) return "1.8배";
  const smallTable: Record<number, number> = { 5: 10, 4: 9, 3: 8, 2: 6, 1: 3 };
  const passCount = smallTable[recruitCount];
  if (!passCount) return "-";
  return `${(passCount / recruitCount).toFixed(1)}배`;
}

function getPassCount(recruitCount: number, tabKey: RegionTabKey): number {
  if (!Number.isInteger(recruitCount) || recruitCount <= 0) return 0;
  const isPublic = tabKey === "PUBLIC_MALE" || tabKey === "PUBLIC_FEMALE";
  if (isPublic) {
    if (recruitCount >= 51) return Math.ceil(recruitCount * 1.5);
    if (recruitCount >= 21) return Math.ceil(recruitCount * 2);
    if (recruitCount >= 11) return Math.ceil(recruitCount * 2.5);
    return Math.ceil(recruitCount * 3);
  }
  if (recruitCount >= 51) return Math.ceil(recruitCount * 1.5);
  if (recruitCount >= 6) return Math.ceil(recruitCount * 1.8);
  const smallTable: Record<number, number> = { 5: 10, 4: 9, 3: 8, 2: 6, 1: 3 };
  return smallTable[recruitCount] ?? 0;
}

function toSafeNonNegativeInt(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export default function AdminRegionsPage() {
  const tenant = useTenantConfig();
  const { enabled: regionsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("regions");
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [regions, setRegions] = useState<EditableRegionItem[]>([]);
  const [originalById, setOriginalById] = useState<Map<number, EditableRegionItem>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [activeTab, setActiveTab] = useState<RegionTabKey>("PUBLIC_MALE");
  const { confirm, modalProps } = useConfirmModal();

  const selectedExam = useMemo(() => exams.find((e) => e.id === selectedExamId), [exams, selectedExamId]);

  const changedCount = useMemo(() => {
    let count = 0;
    for (const row of regions) {
      const original = originalById.get(row.id);
      if (!original) continue;
      if (
        original.isActive !== row.isActive ||
        original.recruitPublicMale !== row.recruitPublicMale ||
        original.recruitPublicFemale !== row.recruitPublicFemale ||
        original.recruitRescue !== row.recruitRescue ||
        original.recruitAcademicMale !== row.recruitAcademicMale ||
        original.recruitAcademicFemale !== row.recruitAcademicFemale ||
        original.recruitAcademicCombined !== row.recruitAcademicCombined ||
        original.recruitEmtMale !== row.recruitEmtMale ||
        original.recruitEmtFemale !== row.recruitEmtFemale ||
        original.applicantPublicMale !== row.applicantPublicMale ||
        original.applicantPublicFemale !== row.applicantPublicFemale ||
        original.applicantRescue !== row.applicantRescue ||
        original.applicantAcademicMale !== row.applicantAcademicMale ||
        original.applicantAcademicFemale !== row.applicantAcademicFemale ||
        original.applicantAcademicCombined !== row.applicantAcademicCombined ||
        original.applicantEmtMale !== row.applicantEmtMale ||
        original.applicantEmtFemale !== row.applicantEmtFemale ||
        original.examNumberStartPublicMale !== row.examNumberStartPublicMale ||
        original.examNumberEndPublicMale !== row.examNumberEndPublicMale ||
        original.examNumberStartPublicFemale !== row.examNumberStartPublicFemale ||
        original.examNumberEndPublicFemale !== row.examNumberEndPublicFemale ||
        original.examNumberStartCareerRescue !== row.examNumberStartCareerRescue ||
        original.examNumberEndCareerRescue !== row.examNumberEndCareerRescue ||
        original.examNumberStartCareerAcademicMale !== row.examNumberStartCareerAcademicMale ||
        original.examNumberEndCareerAcademicMale !== row.examNumberEndCareerAcademicMale ||
        original.examNumberStartCareerAcademicFemale !== row.examNumberStartCareerAcademicFemale ||
        original.examNumberEndCareerAcademicFemale !== row.examNumberEndCareerAcademicFemale ||
        original.examNumberStartCareerAcademicCombined !== row.examNumberStartCareerAcademicCombined ||
        original.examNumberEndCareerAcademicCombined !== row.examNumberEndCareerAcademicCombined ||
        original.examNumberStartCareerEmtMale !== row.examNumberStartCareerEmtMale ||
        original.examNumberEndCareerEmtMale !== row.examNumberEndCareerEmtMale ||
        original.examNumberStartCareerEmtFemale !== row.examNumberStartCareerEmtFemale ||
        original.examNumberEndCareerEmtFemale !== row.examNumberEndCareerEmtFemale
      ) {
        count += 1;
      }
    }
    return count;
  }, [regions, originalById]);

  function getTabChangedCount(tabKey: RegionTabKey): number {
    let count = 0;
    for (const row of regions) {
      const original = originalById.get(row.id);
      if (!original) continue;
      const activeChanged = original.isActive !== row.isActive;
      let fieldChanged = false;
      if (tabKey === "PUBLIC_MALE") {
        fieldChanged = original.recruitPublicMale !== row.recruitPublicMale ||
          original.applicantPublicMale !== row.applicantPublicMale ||
          original.examNumberStartPublicMale !== row.examNumberStartPublicMale ||
          original.examNumberEndPublicMale !== row.examNumberEndPublicMale;
      } else if (tabKey === "PUBLIC_FEMALE") {
        fieldChanged = original.recruitPublicFemale !== row.recruitPublicFemale ||
          original.applicantPublicFemale !== row.applicantPublicFemale ||
          original.examNumberStartPublicFemale !== row.examNumberStartPublicFemale ||
          original.examNumberEndPublicFemale !== row.examNumberEndPublicFemale;
      } else if (tabKey === "CAREER_RESCUE") {
        fieldChanged = original.recruitRescue !== row.recruitRescue ||
          original.applicantRescue !== row.applicantRescue ||
          original.examNumberStartCareerRescue !== row.examNumberStartCareerRescue ||
          original.examNumberEndCareerRescue !== row.examNumberEndCareerRescue;
      } else if (tabKey === "CAREER_ACADEMIC_MALE") {
        fieldChanged = original.recruitAcademicMale !== row.recruitAcademicMale ||
          original.applicantAcademicMale !== row.applicantAcademicMale ||
          original.examNumberStartCareerAcademicMale !== row.examNumberStartCareerAcademicMale ||
          original.examNumberEndCareerAcademicMale !== row.examNumberEndCareerAcademicMale;
      } else if (tabKey === "CAREER_ACADEMIC_FEMALE") {
        fieldChanged = original.recruitAcademicFemale !== row.recruitAcademicFemale ||
          original.applicantAcademicFemale !== row.applicantAcademicFemale ||
          original.examNumberStartCareerAcademicFemale !== row.examNumberStartCareerAcademicFemale ||
          original.examNumberEndCareerAcademicFemale !== row.examNumberEndCareerAcademicFemale;
      } else if (tabKey === "CAREER_ACADEMIC_COMBINED") {
        fieldChanged = original.recruitAcademicCombined !== row.recruitAcademicCombined ||
          original.applicantAcademicCombined !== row.applicantAcademicCombined ||
          original.examNumberStartCareerAcademicCombined !== row.examNumberStartCareerAcademicCombined ||
          original.examNumberEndCareerAcademicCombined !== row.examNumberEndCareerAcademicCombined;
      } else if (tabKey === "CAREER_EMT_MALE") {
        fieldChanged = original.recruitEmtMale !== row.recruitEmtMale ||
          original.applicantEmtMale !== row.applicantEmtMale ||
          original.examNumberStartCareerEmtMale !== row.examNumberStartCareerEmtMale ||
          original.examNumberEndCareerEmtMale !== row.examNumberEndCareerEmtMale;
      } else {
        fieldChanged = original.recruitEmtFemale !== row.recruitEmtFemale ||
          original.applicantEmtFemale !== row.applicantEmtFemale ||
          original.examNumberStartCareerEmtFemale !== row.examNumberStartCareerEmtFemale ||
          original.examNumberEndCareerEmtFemale !== row.examNumberEndCareerEmtFemale;
      }
      if (activeChanged || fieldChanged) count += 1;
    }
    return count;
  }

  const loadRegions = useCallback(async (examId?: number | null) => {
    setIsLoading(true);
    setNotice(null);
    try {
      const params = new URLSearchParams();
      if (examId) params.set("examId", String(examId));
      const response = await fetch(`/api/admin/regions?${params.toString()}`, { method: "GET", cache: "no-store" });
      const data = (await response.json()) as RegionsResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "모집인원 목록을 불러오지 못했습니다.");

      setExams(data.exams ?? []);
      setSelectedExamId(data.selectedExamId);
      const nextRows = (data.regions ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        isActive: Boolean(item.isActive),
        recruitPublicMale: item.recruitPublicMale,
        recruitPublicFemale: item.recruitPublicFemale,
        recruitRescue: item.recruitRescue,
        recruitAcademicMale: item.recruitAcademicMale,
        recruitAcademicFemale: item.recruitAcademicFemale,
        recruitAcademicCombined: item.recruitAcademicCombined,
        recruitEmtMale: item.recruitEmtMale,
        recruitEmtFemale: item.recruitEmtFemale,
        applicantPublicMale: item.applicantPublicMale ?? null,
        applicantPublicFemale: item.applicantPublicFemale ?? null,
        applicantRescue: item.applicantRescue ?? null,
        applicantAcademicMale: item.applicantAcademicMale ?? null,
        applicantAcademicFemale: item.applicantAcademicFemale ?? null,
        applicantAcademicCombined: item.applicantAcademicCombined ?? null,
        applicantEmtMale: item.applicantEmtMale ?? null,
        applicantEmtFemale: item.applicantEmtFemale ?? null,
        examNumberStartPublicMale: item.examNumberStartPublicMale ?? null,
        examNumberEndPublicMale: item.examNumberEndPublicMale ?? null,
        examNumberStartPublicFemale: item.examNumberStartPublicFemale ?? null,
        examNumberEndPublicFemale: item.examNumberEndPublicFemale ?? null,
        examNumberStartCareerRescue: item.examNumberStartCareerRescue ?? null,
        examNumberEndCareerRescue: item.examNumberEndCareerRescue ?? null,
        examNumberStartCareerAcademicMale: item.examNumberStartCareerAcademicMale ?? null,
        examNumberEndCareerAcademicMale: item.examNumberEndCareerAcademicMale ?? null,
        examNumberStartCareerAcademicFemale: item.examNumberStartCareerAcademicFemale ?? null,
        examNumberEndCareerAcademicFemale: item.examNumberEndCareerAcademicFemale ?? null,
        examNumberStartCareerAcademicCombined: item.examNumberStartCareerAcademicCombined ?? null,
        examNumberEndCareerAcademicCombined: item.examNumberEndCareerAcademicCombined ?? null,
        examNumberStartCareerEmtMale: item.examNumberStartCareerEmtMale ?? null,
        examNumberEndCareerEmtMale: item.examNumberEndCareerEmtMale ?? null,
        examNumberStartCareerEmtFemale: item.examNumberStartCareerEmtFemale ?? null,
        examNumberEndCareerEmtFemale: item.examNumberEndCareerEmtFemale ?? null,
        submissionCount: item.submissionCount,
        submissionCountPublic: item.submissionCountPublic,
        submissionCountCareerRescue: item.submissionCountCareerRescue,
        submissionCountCareerAcademic: item.submissionCountCareerAcademic,
        submissionCountCareerEmt: item.submissionCountCareerEmt,
      }));
      setRegions(nextRows);
      setOriginalById(new Map(nextRows.map((row) => [row.id, { ...row }] as const)));
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "조회 실패" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!regionsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    void loadRegions();
  }, [isFeatureLoading, loadRegions, regionsEnabled]);

  async function handleExamChange(newExamId: number) {
    if (changedCount > 0) {
      const ok = await confirm({ title: "시험 변경", description: "저장하지 않은 변경사항이 있습니다. 시험을 변경하시겠습니까?", variant: "danger" });
      if (!ok) return;
    }
    setSelectedExamId(newExamId);
    void loadRegions(newExamId);
  }

  type RecruitField = "recruitPublicMale" | "recruitPublicFemale" | "recruitRescue" | "recruitAcademicMale" | "recruitAcademicFemale" | "recruitAcademicCombined" | "recruitEmtMale" | "recruitEmtFemale";
  type ApplicantField = "applicantPublicMale" | "applicantPublicFemale" | "applicantRescue" | "applicantAcademicMale" | "applicantAcademicFemale" | "applicantAcademicCombined" | "applicantEmtMale" | "applicantEmtFemale";
  type ExamNumberField = "examNumberStartPublicMale" | "examNumberEndPublicMale" | "examNumberStartPublicFemale" | "examNumberEndPublicFemale" | "examNumberStartCareerRescue" | "examNumberEndCareerRescue" | "examNumberStartCareerAcademicMale" | "examNumberEndCareerAcademicMale" | "examNumberStartCareerAcademicFemale" | "examNumberEndCareerAcademicFemale" | "examNumberStartCareerAcademicCombined" | "examNumberEndCareerAcademicCombined" | "examNumberStartCareerEmtMale" | "examNumberEndCareerEmtMale" | "examNumberStartCareerEmtFemale" | "examNumberEndCareerEmtFemale";

  function updateRegionValue(id: number, field: RecruitField, value: string) {
    setRegions((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: toSafeNonNegativeInt(value) } : row)));
  }

  function updateRegionNullableValue(id: number, field: ApplicantField, value: string) {
    setRegions((prev) => prev.map((row) => (
      row.id === id
        ? { ...row, [field]: value.trim() === "" ? null : toSafeNonNegativeInt(value) }
        : row
    )));
  }

  function updateRegionStringValue(id: number, field: ExamNumberField, value: string) {
    const normalized = value.replace(/\D/g, "").slice(0, 10);
    setRegions((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: normalized || null } : row)));
  }

  function updateRegionActive(id: number, nextActive: boolean) {
    setRegions((prev) => prev.map((row) => (row.id === id ? { ...row, isActive: nextActive } : row)));
  }

  function isFieldChanged(row: EditableRegionItem, field: keyof EditableRegionItem): boolean {
    const original = originalById.get(row.id);
    if (!original) return false;
    return original[field] !== row[field];
  }

  async function handleSaveAll() {
    if (!selectedExamId) {
      setNotice({ type: "error", message: "시험이 선택되지 않았습니다." });
      return;
    }
    if (changedCount < 1) {
      setNotice({ type: "error", message: "변경된 지역 설정이 없습니다." });
      return;
    }

    const ok = await confirm({
      title: "모집인원 저장",
      description: "지역 활성 상태/모집인원 변경은 성적 입력 및 합격예측에 즉시 반영됩니다.\n저장하시겠습니까?",
    });
    if (!ok) return;

    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/regions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId,
          regions: regions.map((row) => ({
            regionId: row.id,
            isActive: row.isActive,
            recruitPublicMale: row.recruitPublicMale,
            recruitPublicFemale: row.recruitPublicFemale,
            recruitRescue: row.recruitRescue,
            recruitAcademicMale: row.recruitAcademicMale,
            recruitAcademicFemale: row.recruitAcademicFemale,
            recruitAcademicCombined: row.recruitAcademicCombined,
            recruitEmtMale: row.recruitEmtMale,
            recruitEmtFemale: row.recruitEmtFemale,
            applicantPublicMale: row.applicantPublicMale,
            applicantPublicFemale: row.applicantPublicFemale,
            applicantRescue: row.applicantRescue,
            applicantAcademicMale: row.applicantAcademicMale,
            applicantAcademicFemale: row.applicantAcademicFemale,
            applicantAcademicCombined: row.applicantAcademicCombined,
            applicantEmtMale: row.applicantEmtMale,
            applicantEmtFemale: row.applicantEmtFemale,
            examNumberStartPublicMale: row.examNumberStartPublicMale,
            examNumberEndPublicMale: row.examNumberEndPublicMale,
            examNumberStartPublicFemale: row.examNumberStartPublicFemale,
            examNumberEndPublicFemale: row.examNumberEndPublicFemale,
            examNumberStartCareerRescue: row.examNumberStartCareerRescue,
            examNumberEndCareerRescue: row.examNumberEndCareerRescue,
            examNumberStartCareerAcademicMale: row.examNumberStartCareerAcademicMale,
            examNumberEndCareerAcademicMale: row.examNumberEndCareerAcademicMale,
            examNumberStartCareerAcademicFemale: row.examNumberStartCareerAcademicFemale,
            examNumberEndCareerAcademicFemale: row.examNumberEndCareerAcademicFemale,
            examNumberStartCareerAcademicCombined: row.examNumberStartCareerAcademicCombined,
            examNumberEndCareerAcademicCombined: row.examNumberEndCareerAcademicCombined,
            examNumberStartCareerEmtMale: row.examNumberStartCareerEmtMale,
            examNumberEndCareerEmtMale: row.examNumberEndCareerEmtMale,
            examNumberStartCareerEmtFemale: row.examNumberStartCareerEmtFemale,
            examNumberEndCareerEmtFemale: row.examNumberEndCareerEmtFemale,
          })),
        }),
      });
      const data = (await response.json()) as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? "저장 실패");
      setNotice({ type: "success", message: data.message ?? "저장되었습니다." });
      setOriginalById(new Map(regions.map((row) => [row.id, { ...row }] as const)));
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "저장 실패" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyFromExam(sourceExamId: number) {
    if (!selectedExamId) return;
    const sourceExam = exams.find((e) => e.id === sourceExamId);
    const ok = await confirm({
      title: "모집인원 복사",
      description: `"${sourceExam?.name ?? "선택된 시험"}"의 모집인원을 현재 시험으로 복사하시겠습니까?\n기존 데이터가 덮어씌워집니다.`,
      variant: "danger",
    });
    if (!ok) return;

    setIsCopying(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceExamId, targetExamId: selectedExamId }),
      });
      const data = (await response.json()) as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? "복사 실패");
      setNotice({ type: "success", message: data.message ?? "복사되었습니다." });
      void loadRegions(selectedExamId);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "복사 실패" });
    } finally {
      setIsCopying(false);
    }
  }

  const otherExams = exams.filter((e) => e.id !== selectedExamId);

  if (isFeatureLoading || (regionsEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">관리 화면을 불러오는 중입니다...</p>;
  }

  if (!regionsEnabled) {
    return <AdminFeatureDisabledState feature="regions" />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">지역/모집인원 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          시험별로 지역 활성/비활성 및 공채(남/여)·경채 모집인원을 관리합니다.
        </p>
      </header>

      {/* 선택된 시험 헤더 */}
      {selectedExam ? (
        <div className="rounded-xl border border-fire-200 bg-fire-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fire-600">현재 선택된 시험</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{selectedExam.name}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            상태: {selectedExam.isActive ? "활성" : "비활성"}
          </p>
        </div>
      ) : null}

      {/* 시험 선택 + 복사 */}
      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium text-slate-700">시험 선택</label>
        <select
          value={selectedExamId ?? ""}
          onChange={(e) => void handleExamChange(Number(e.target.value))}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
          disabled={isLoading}
        >
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name} {exam.isActive ? "(활성)" : ""}
            </option>
          ))}
        </select>

        {otherExams.length > 0 && selectedExamId && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">다른 시험에서 복사:</span>
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
              disabled={isCopying}
              defaultValue=""
              onChange={(e) => {
                const sourceId = Number(e.target.value);
                if (sourceId) {
                  void handleCopyFromExam(sourceId);
                  e.target.value = "";
                }
              }}
            >
              <option value="" disabled>시험 선택...</option>
              {otherExams.map((exam) => (
                <option key={exam.id} value={exam.id}>{exam.name}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">비활성 지역은 사용자 성적 입력 및 예측 대상에서 제외됩니다.</p>
        <p className="mt-1">대구/경북만 운영하려면 해당 지역만 활성으로 두고 저장하세요.</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p>
          1배수 기준 인원은 모집인원과 동일합니다. 실제 1배수 끝등수/동점 인원/컷 점수는{" "}
          <Link
            href={withTenantPrefix("/admin/stats", tenant.type)}
            className="font-semibold text-slate-900 underline"
          >
            참여 통계
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </section>

      {notice ? (
        <p className={`rounded-md px-3 py-2 text-sm ${
          notice.type === "success"
            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border border-rose-200 bg-rose-50 text-rose-700"
        }`}>
          {notice.message}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-600">지역 데이터를 불러오는 중입니다...</p>
      ) : regions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
          등록된 지역이 없습니다.
        </p>
      ) : (
        <>
          {/* 공채(남)/공채(여)/구조/소방학과남/소방학과여/소방학과양성/구급남/구급여 탭 */}
          <div className="flex flex-wrap border-b border-slate-200">
            {([
              { key: "PUBLIC_MALE" as RegionTabKey, label: "공채(남)" },
              { key: "PUBLIC_FEMALE" as RegionTabKey, label: "공채(여)" },
              { key: "CAREER_RESCUE" as RegionTabKey, label: "구조" },
              { key: "CAREER_ACADEMIC_MALE" as RegionTabKey, label: "소방학과(남)" },
              { key: "CAREER_ACADEMIC_FEMALE" as RegionTabKey, label: "소방학과(여)" },
              { key: "CAREER_ACADEMIC_COMBINED" as RegionTabKey, label: "소방학과(양성)" },
              { key: "CAREER_EMT_MALE" as RegionTabKey, label: "구급(남)" },
              { key: "CAREER_EMT_FEMALE" as RegionTabKey, label: "구급(여)" },
            ]).map((tab) => {
              const tabChanged = getTabChangedCount(tab.key);
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-5 py-2.5 text-sm font-semibold transition-colors ${
                    activeTab === tab.key
                      ? "text-fire-700"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                  {tabChanged > 0 && (
                    <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">
                      {tabChanged}
                    </span>
                  )}
                  {activeTab === tab.key && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-fire-600" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[800px] w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">지역</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">모집인원</th>
                  <th className="px-4 py-3">응시번호 범위</th>
                  <th className="px-4 py-3">참여 현황</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {regions.map((row) => {
                  const tabFieldMap = {
                    PUBLIC_MALE: {
                      recruit: row.recruitPublicMale,
                      recruitField: "recruitPublicMale" as RecruitField,
                      applicant: row.applicantPublicMale,
                      applicantField: "applicantPublicMale" as ApplicantField,
                      numStart: row.examNumberStartPublicMale,
                      numEnd: row.examNumberEndPublicMale,
                      numStartField: "examNumberStartPublicMale" as ExamNumberField,
                      numEndField: "examNumberEndPublicMale" as ExamNumberField,
                      submissionCount: row.submissionCountPublic,
                    },
                    PUBLIC_FEMALE: {
                      recruit: row.recruitPublicFemale,
                      recruitField: "recruitPublicFemale" as RecruitField,
                      applicant: row.applicantPublicFemale,
                      applicantField: "applicantPublicFemale" as ApplicantField,
                      numStart: row.examNumberStartPublicFemale,
                      numEnd: row.examNumberEndPublicFemale,
                      numStartField: "examNumberStartPublicFemale" as ExamNumberField,
                      numEndField: "examNumberEndPublicFemale" as ExamNumberField,
                      submissionCount: row.submissionCountPublic,
                    },
                    CAREER_RESCUE: {
                      recruit: row.recruitRescue,
                      recruitField: "recruitRescue" as RecruitField,
                      applicant: row.applicantRescue,
                      applicantField: "applicantRescue" as ApplicantField,
                      numStart: row.examNumberStartCareerRescue,
                      numEnd: row.examNumberEndCareerRescue,
                      numStartField: "examNumberStartCareerRescue" as ExamNumberField,
                      numEndField: "examNumberEndCareerRescue" as ExamNumberField,
                      submissionCount: row.submissionCountCareerRescue,
                    },
                    CAREER_ACADEMIC_MALE: {
                      recruit: row.recruitAcademicMale,
                      recruitField: "recruitAcademicMale" as RecruitField,
                      applicant: row.applicantAcademicMale,
                      applicantField: "applicantAcademicMale" as ApplicantField,
                      numStart: row.examNumberStartCareerAcademicMale,
                      numEnd: row.examNumberEndCareerAcademicMale,
                      numStartField: "examNumberStartCareerAcademicMale" as ExamNumberField,
                      numEndField: "examNumberEndCareerAcademicMale" as ExamNumberField,
                      submissionCount: row.submissionCountCareerAcademic,
                    },
                    CAREER_ACADEMIC_FEMALE: {
                      recruit: row.recruitAcademicFemale,
                      recruitField: "recruitAcademicFemale" as RecruitField,
                      applicant: row.applicantAcademicFemale,
                      applicantField: "applicantAcademicFemale" as ApplicantField,
                      numStart: row.examNumberStartCareerAcademicFemale,
                      numEnd: row.examNumberEndCareerAcademicFemale,
                      numStartField: "examNumberStartCareerAcademicFemale" as ExamNumberField,
                      numEndField: "examNumberEndCareerAcademicFemale" as ExamNumberField,
                      submissionCount: row.submissionCountCareerAcademic,
                    },
                    CAREER_ACADEMIC_COMBINED: {
                      recruit: row.recruitAcademicCombined,
                      recruitField: "recruitAcademicCombined" as RecruitField,
                      applicant: row.applicantAcademicCombined,
                      applicantField: "applicantAcademicCombined" as ApplicantField,
                      numStart: row.examNumberStartCareerAcademicCombined,
                      numEnd: row.examNumberEndCareerAcademicCombined,
                      numStartField: "examNumberStartCareerAcademicCombined" as ExamNumberField,
                      numEndField: "examNumberEndCareerAcademicCombined" as ExamNumberField,
                      submissionCount: row.submissionCountCareerAcademic,
                    },
                    CAREER_EMT_MALE: {
                      recruit: row.recruitEmtMale,
                      recruitField: "recruitEmtMale" as RecruitField,
                      applicant: row.applicantEmtMale,
                      applicantField: "applicantEmtMale" as ApplicantField,
                      numStart: row.examNumberStartCareerEmtMale,
                      numEnd: row.examNumberEndCareerEmtMale,
                      numStartField: "examNumberStartCareerEmtMale" as ExamNumberField,
                      numEndField: "examNumberEndCareerEmtMale" as ExamNumberField,
                      submissionCount: row.submissionCountCareerEmt,
                    },
                    CAREER_EMT_FEMALE: {
                      recruit: row.recruitEmtFemale,
                      recruitField: "recruitEmtFemale" as RecruitField,
                      applicant: row.applicantEmtFemale,
                      applicantField: "applicantEmtFemale" as ApplicantField,
                      numStart: row.examNumberStartCareerEmtFemale,
                      numEnd: row.examNumberEndCareerEmtFemale,
                      numStartField: "examNumberStartCareerEmtFemale" as ExamNumberField,
                      numEndField: "examNumberEndCareerEmtFemale" as ExamNumberField,
                      submissionCount: row.submissionCountCareerEmt,
                    },
                  };
                  const { recruit, recruitField, applicant, applicantField, numStart, numEnd, numStartField, numEndField, submissionCount } = tabFieldMap[activeTab];

                  return (
                    <tr key={row.id} className="bg-white">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                      <td className="px-4 py-3">
                        <label
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${
                            isFieldChanged(row, "isActive")
                              ? "border-amber-300 bg-amber-50"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={row.isActive}
                            onChange={(event) => updateRegionActive(row.id, event.target.checked)}
                          />
                          {row.isActive ? "활성" : "비활성"}
                        </label>
                      </td>

                      {/* 모집인원 + 합격배수 + 접수인원 + 경쟁률 */}
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={recruit}
                          onChange={(e) => updateRegionValue(row.id, recruitField, e.target.value)}
                          className={`h-9 w-24 rounded-md border px-2 text-right text-sm ${
                            isFieldChanged(row, recruitField)
                              ? "border-amber-300 bg-amber-50"
                              : "border-slate-300 bg-white"
                          }`}
                        />
                        <span className="ml-1 text-xs text-slate-500">명</span>
                        {recruit > 0 ? (
                          <p className="mt-1 text-xs text-slate-500">
                            합격배수 {getPassMultipleText(recruit, activeTab)} ({getPassCount(recruit, activeTab)}명 선발)
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center gap-1">
                          <span className="text-xs text-slate-500">접수:</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={applicant ?? ""}
                            onChange={(e) => updateRegionNullableValue(row.id, applicantField, e.target.value)}
                            placeholder="미입력"
                            className={`h-8 w-24 rounded-md border px-2 text-right text-sm ${
                              isFieldChanged(row, applicantField)
                                ? "border-amber-300 bg-amber-50"
                                : "border-slate-300 bg-white"
                            }`}
                          />
                          <span className="text-xs text-slate-500">명</span>
                        </div>
                        {applicant !== null && recruit > 0 ? (
                          <p className="mt-0.5 text-xs text-slate-500">
                            경쟁률 {(applicant / recruit).toFixed(1)} : 1
                          </p>
                        ) : null}
                      </td>

                      {/* 응시번호 범위 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={numStart ?? ""}
                            onChange={(e) => updateRegionStringValue(row.id, numStartField, e.target.value)}
                            placeholder="시작"
                            inputMode="numeric"
                            maxLength={10}
                            className={`h-9 w-24 rounded-md border px-2 text-center text-sm font-mono ${
                              isFieldChanged(row, numStartField)
                                ? "border-amber-300 bg-amber-50"
                                : "border-slate-300 bg-white"
                            }`}
                          />
                          <span className="text-slate-400">~</span>
                          <input
                            type="text"
                            value={numEnd ?? ""}
                            onChange={(e) => updateRegionStringValue(row.id, numEndField, e.target.value)}
                            placeholder="끝"
                            inputMode="numeric"
                            maxLength={10}
                            className={`h-9 w-24 rounded-md border px-2 text-center text-sm font-mono ${
                              isFieldChanged(row, numEndField)
                                ? "border-amber-300 bg-amber-50"
                                : "border-slate-300 bg-white"
                            }`}
                          />
                        </div>
                      </td>

                      {/* 참여 현황 */}
                      <td className="px-4 py-3 text-slate-700">
                        {submissionCount}명
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">변경된 지역 수: {changedCount}개</p>
        <Button type="button" onClick={() => void handleSaveAll()} disabled={isLoading || isSaving || changedCount < 1}>
          {isSaving ? "저장 중..." : "전체 저장"}
        </Button>
      </div>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
