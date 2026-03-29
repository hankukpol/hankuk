import type { BonusType, ExamType, Gender, Role } from "@prisma/client";

export type UserRole = Role;
export type RecruitExamType = ExamType;
export type UserGender = Gender;
export type BonusCategory = BonusType;

// ── 소방 (fire): 성별 분리 모집 ──
export interface FireRegionRecruitInfo {
  name: string;
  recruitPublicMale: number;
  recruitPublicFemale: number;
  recruitRescue: number;
  recruitAcademicMale: number;
  recruitAcademicFemale: number;
  recruitAcademicCombined: number;
  recruitEmtMale: number;
  recruitEmtFemale: number;
}

// ── 경찰 (police): 공채/경채 단순 모집 ──
export interface PoliceRegionRecruitInfo {
  name: string;
  recruitCount: number;
  recruitCountCareer: number;
}

// 통합 타입 (양쪽 모두 호환)
export type RegionRecruitInfo = FireRegionRecruitInfo | PoliceRegionRecruitInfo;

export interface SubjectDefinition {
  name: string;
  examType: ExamType;
  questionCount: number;
  pointPerQuestion: number;
  maxScore: number;
}

// ── 소방 회원가입 ──
export interface FireRegisterFormData {
  name: string;
  email?: string;
  phone: string;
  password: string;
  agreedToTerms: boolean;
  agreedToPrivacy: boolean;
}

// ── 경찰 회원가입 ──
export interface PoliceRegisterFormData {
  name: string;
  username: string;
  contactPhone: string;
  email: string;
  password: string;
  agreeToTerms: boolean;
  agreeToPrivacy: boolean;
}

export type RegisterFormData = FireRegisterFormData | PoliceRegisterFormData;

// ── 소방 로그인 ──
export interface FireLoginFormData {
  phone: string;
  password: string;
}

// ── 경찰 로그인 ──
export interface PoliceLoginFormData {
  username: string;
  password: string;
}

export type LoginFormData = FireLoginFormData | PoliceLoginFormData;

// ── 경찰 비밀번호 찾기 ──
export interface PasswordResetRequestFormData {
  username: string;
  email: string;
}

export interface ResetPasswordFormData {
  username: string;
  email: string;
  resetCode: string;
  password: string;
}

export interface ScoringSummary {
  totalRawScore: number;
  bonusScore: number;
  finalScore: number;
  isFailed: boolean;
  isTotalCutoff?: boolean; // 소방 전용: 총점 60% 미만 과락
}
