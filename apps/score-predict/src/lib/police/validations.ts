import type {
  PasswordResetRequestFormData,
  PoliceLoginFormData,
  PoliceRegisterFormData,
  ResetPasswordFormData,
} from "@/types";

export interface ValidationResult<T> {
  isValid: boolean;
  errors: string[];
  data?: T;
}

const MSG = {
  passwordRequired: "\uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  passwordMin: "\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.",
  passwordLowercase: "\uBE44\uBC00\uBC88\uD638\uC5D0 \uC601\uBB38 \uC18C\uBB38\uC790\uB97C 1\uC790 \uC774\uC0C1 \uD3EC\uD568\uD574 \uC8FC\uC138\uC694.",
  passwordNumber: "\uBE44\uBC00\uBC88\uD638\uC5D0 \uC22B\uC790\uB97C 1\uC790 \uC774\uC0C1 \uD3EC\uD568\uD574 \uC8FC\uC138\uC694.",
  passwordSpecial: "\uBE44\uBC00\uBC88\uD638\uC5D0 \uD2B9\uC218\uBB38\uC790\uB97C 1\uC790 \uC774\uC0C1 \uD3EC\uD568\uD574 \uC8FC\uC138\uC694.",
  nameInvalid: "\uC774\uB984\uC740 \uD55C\uAE00 2\uC790 \uC774\uC0C1 20\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  usernameInvalid:
    "\uC544\uC774\uB514\uB294 \uC601\uBB38, \uC22B\uC790, \uBC11\uC904(_), \uD558\uC774\uD508(-)\uB9CC \uC0AC\uC6A9\uD574 4\uC790 \uC774\uC0C1 20\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  emailInvalid: "\uC774\uBA54\uC77C \uC8FC\uC18C\uB97C \uC62C\uBC14\uB974\uAC8C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  agreeTerms: "\uC774\uC6A9\uC57D\uAD00\uC5D0 \uB3D9\uC758\uD574 \uC8FC\uC138\uC694.",
  agreePrivacy: "\uAC1C\uC778\uC815\uBCF4 \uC218\uC9D1 \uBC0F \uC774\uC6A9\uC5D0 \uB3D9\uC758\uD574 \uC8FC\uC138\uC694.",
  usernameCheck: "\uC544\uC774\uB514\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  resetCodeCheck: "\uC778\uC99D\uCF54\uB4DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  contactPhoneInvalid: "연락처는 올바른 휴대폰 번호 형식으로 입력해 주세요. (예: 010-1234-5678)",
  contactPhoneRequired: "연락처를 입력해 주세요.",
};

const koreanNameRegex = /^[\uAC00-\uD7A3]+$/;
const usernameRegex = /^[A-Za-z0-9][A-Za-z0-9_-]{3,19}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 한국 휴대폰 번호: 010-1234-5678, 01012345678, 010 1234 5678 형식 허용
const contactPhoneRegex = /^01[016789][- ]?\d{3,4}[- ]?\d{4}$/;
const passwordHasLowercase = /[a-z]/;
const passwordHasNumber = /\d/;
const passwordHasSpecial = /[^A-Za-z0-9]/;

export function normalizeUsername(rawUsername: string): string {
  return rawUsername.trim();
}

export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

export function normalizeResetCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function validatePasswordRules(password: string): string[] {
  const errors: string[] = [];

  if (!password) {
    errors.push(MSG.passwordRequired);
  } else if (password.length < 8) {
    errors.push(MSG.passwordMin);
  } else {
    if (!passwordHasLowercase.test(password)) {
      errors.push(MSG.passwordLowercase);
    }
    if (!passwordHasNumber.test(password)) {
      errors.push(MSG.passwordNumber);
    }
    if (!passwordHasSpecial.test(password)) {
      errors.push(MSG.passwordSpecial);
    }
  }

  return errors;
}

export function validatePasswordStrength(rawPassword: string): ValidationResult<string> {
  const password = rawPassword.trim();
  const errors = validatePasswordRules(password);

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [], data: password };
}

export function normalizeContactPhone(raw: string): string {
  // 숫자만 추출하여 하이픈 없는 형식으로 정규화 (010-1234-5678 → 01012345678)
  return raw.replace(/[- ]/g, "").trim();
}

export function validateRegisterInput(
  input: Partial<PoliceRegisterFormData>
): ValidationResult<PoliceRegisterFormData> {
  const errors: string[] = [];
  const name = input.name?.trim() ?? "";
  const nameWithoutSpaces = name.replace(/\s+/g, "");
  const username = normalizeUsername(input.username ?? "");
  const contactPhone = input.contactPhone?.trim() ?? "";
  const email = normalizeEmail(input.email ?? "");
  const password = input.password?.trim() ?? "";
  const agreeToTerms = input.agreeToTerms === true;
  const agreeToPrivacy = input.agreeToPrivacy === true;

  if (
    nameWithoutSpaces.length < 2 ||
    nameWithoutSpaces.length > 20 ||
    !koreanNameRegex.test(nameWithoutSpaces)
  ) {
    errors.push(MSG.nameInvalid);
  }

  if (!usernameRegex.test(username)) {
    errors.push(MSG.usernameInvalid);
  }

  if (!contactPhone) {
    errors.push(MSG.contactPhoneRequired);
  } else if (!contactPhoneRegex.test(contactPhone)) {
    errors.push(MSG.contactPhoneInvalid);
  }

  if (!emailRegex.test(email)) {
    errors.push(MSG.emailInvalid);
  }

  errors.push(...validatePasswordRules(password));

  if (!agreeToTerms) {
    errors.push(MSG.agreeTerms);
  }

  if (!agreeToPrivacy) {
    errors.push(MSG.agreePrivacy);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      name,
      username,
      contactPhone: normalizeContactPhone(contactPhone),
      email,
      password,
      agreeToTerms,
      agreeToPrivacy,
    },
  };
}

export function validateLoginInput(
  input: Partial<PoliceLoginFormData>
): ValidationResult<PoliceLoginFormData> {
  const errors: string[] = [];
  const username = normalizeUsername(input.username ?? "");
  const password = input.password?.trim() ?? "";

  if (!usernameRegex.test(username)) {
    errors.push(MSG.usernameCheck);
  }

  if (!password) {
    errors.push(MSG.passwordRequired);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      username,
      password,
    },
  };
}

export function validatePasswordResetRequestInput(
  input: Partial<PasswordResetRequestFormData>
): ValidationResult<PasswordResetRequestFormData> {
  const errors: string[] = [];
  const username = normalizeUsername(input.username ?? "");
  const email = normalizeEmail(input.email ?? "");

  if (!usernameRegex.test(username)) {
    errors.push(MSG.usernameCheck);
  }

  if (!emailRegex.test(email)) {
    errors.push(MSG.emailInvalid);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      username,
      email,
    },
  };
}

export function validateResetPasswordInput(
  input: Partial<ResetPasswordFormData>
): ValidationResult<ResetPasswordFormData> {
  const errors: string[] = [];
  const username = normalizeUsername(input.username ?? "");
  const email = normalizeEmail(input.email ?? "");
  const resetCode = normalizeResetCode(input.resetCode ?? "");
  const password = input.password?.trim() ?? "";

  if (!usernameRegex.test(username)) {
    errors.push(MSG.usernameCheck);
  }

  if (!emailRegex.test(email)) {
    errors.push(MSG.emailInvalid);
  }

  if (resetCode.length !== 8) {
    errors.push(MSG.resetCodeCheck);
  }

  errors.push(...validatePasswordRules(password));

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      username,
      email,
      resetCode,
      password,
    },
  };
}

export function validateAnswerValues(
  answers: number[],
  expectedCount: number
): ValidationResult<number[]> {
  const errors: string[] = [];

  if (answers.length !== expectedCount) {
    errors.push(`\uB2F5\uC548 \uAC1C\uC218\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. (\uC785\uB825 ${answers.length} / \uAE30\uC900 ${expectedCount})`);
  }

  answers.forEach((answer, index) => {
    if (!Number.isInteger(answer) || answer < 1 || answer > 4) {
      errors.push(`${index + 1}\uBC88 \uBB38\uD56D \uB2F5\uC548\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
    }
  });

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [], data: answers };
}
