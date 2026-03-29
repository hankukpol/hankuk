import type { FireLoginFormData, FireRegisterFormData } from "@/types";

export interface ValidationResult<T> {
  isValid: boolean;
  errors: string[];
  data?: T;
}

const koreanNameRegex = /^[가-힣]{2,20}$/;
const phoneRegex = /^010-\d{4}-\d{4}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordHasLowercase = /[a-z]/;
const passwordHasNumber = /\d/;
const passwordHasSpecial = /[^A-Za-z0-9]/;

export function normalizePhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("010")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return rawPhone.trim();
}

export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return emailRegex.test(email);
}

export function validatePasswordStrength(rawPassword: string): ValidationResult<string> {
  const errors: string[] = [];
  const password = rawPassword.trim();

  if (!password) {
    errors.push("비밀번호를 입력해 주세요.");
  } else if (password.length < 8) {
    errors.push("비밀번호는 8자 이상이어야 합니다.");
  } else {
    if (!passwordHasLowercase.test(password)) {
      errors.push("비밀번호에 영문 소문자를 1자 이상 포함해 주세요.");
    }
    if (!passwordHasNumber.test(password)) {
      errors.push("비밀번호에 숫자를 1자 이상 포함해 주세요.");
    }
    if (!passwordHasSpecial.test(password)) {
      errors.push("비밀번호에 특수문자를 1자 이상 포함해 주세요.");
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [], data: password };
}

export function validateRegisterInput(
  input: Partial<FireRegisterFormData>
): ValidationResult<FireRegisterFormData> {
  const errors: string[] = [];
  const name = input.name?.trim() ?? "";
  const email = normalizeEmail(input.email ?? "");
  const phone = normalizePhone(input.phone ?? "");
  const passwordResult = validatePasswordStrength(input.password ?? "");
  const agreedToTerms = input.agreedToTerms === true;
  const agreedToPrivacy = input.agreedToPrivacy === true;

  if (!koreanNameRegex.test(name)) {
    errors.push("이름은 한글 2~20자로 입력해 주세요.");
  }

  if (!phoneRegex.test(phone)) {
    errors.push("연락처는 010-XXXX-XXXX 형식으로 입력해 주세요.");
  }

  if (email && !isValidEmail(email)) {
    errors.push("이메일 형식이 올바르지 않습니다.");
  }

  if (!passwordResult.isValid) {
    for (const message of passwordResult.errors) {
      errors.push(message);
    }
  }

  if (!agreedToTerms) {
    errors.push("서비스 이용약관에 동의해 주세요.");
  }

  if (!agreedToPrivacy) {
    errors.push("개인정보 수집·이용에 동의해 주세요.");
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      name,
      email: email || undefined,
      phone,
      password: passwordResult.data ?? "",
      agreedToTerms,
      agreedToPrivacy,
    },
  };
}

export function validateLoginInput(
  input: Partial<FireLoginFormData>
): ValidationResult<FireLoginFormData> {
  const errors: string[] = [];
  const phone = normalizePhone(input.phone ?? "");
  const password = input.password?.trim() ?? "";

  if (!phoneRegex.test(phone)) {
    errors.push("연락처는 010-XXXX-XXXX 형식으로 입력해 주세요.");
  }

  if (!password) {
    errors.push("비밀번호를 입력해 주세요.");
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      phone,
      password,
    },
  };
}

export function validateAnswerValues(answers: number[], expectedCount: number): ValidationResult<number[]> {
  const errors: string[] = [];

  if (answers.length !== expectedCount) {
    errors.push(`답안 개수가 올바르지 않습니다. (입력 ${answers.length} / 기준 ${expectedCount})`);
  }

  answers.forEach((answer, index) => {
    if (!Number.isInteger(answer) || answer < 1 || answer > 4) {
      errors.push(`${index + 1}번 문항 답안이 올바르지 않습니다.`);
    }
  });

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [], data: answers };
}

export {
  normalizeContactPhone,
  normalizeResetCode,
  normalizeUsername,
  validatePasswordResetRequestInput,
  validateResetPasswordInput,
} from "@/lib/police/validations";
