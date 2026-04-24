export const MAX_INSTALLMENT_COUNT = 3;

export type InstallmentScheduleDraft = {
  amount: number | string;
  dueDate: string;
};

export type NormalizedInstallmentSchedule = {
  amount: number;
  dueDate: Date;
};

type NormalizeOptions = {
  minCount?: number;
  maxCount?: number;
};

function parseInstallmentAmount(value: number | string) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : Number.NaN;
  }

  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return Number.NaN;
  }

  return Number(normalized);
}

function parseInstallmentDueDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00+09:00`)
    : new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function toInstallmentDateInputValue(
  value: string | Date | null | undefined,
) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeInstallmentSchedule(
  installments: InstallmentScheduleDraft[],
  expectedTotal: number,
  options: NormalizeOptions = {},
) {
  const minCount = options.minCount ?? 1;
  const maxCount = options.maxCount ?? MAX_INSTALLMENT_COUNT;

  if (!Array.isArray(installments)) {
    throw new Error("분할 납부 일정 형식이 올바르지 않습니다.");
  }

  if (installments.length < minCount) {
    throw new Error(`분할 납부 일정은 최소 ${minCount}건 이상이어야 합니다.`);
  }

  if (installments.length > maxCount) {
    throw new Error(`분할 납부 일정은 최대 ${maxCount}건까지만 등록할 수 있습니다.`);
  }

  const normalized = installments.map((installment, index) => {
    const amount = parseInstallmentAmount(installment.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`${index + 1}회차 금액은 0원보다 큰 정수여야 합니다.`);
    }

    const dueDate = parseInstallmentDueDate(installment.dueDate);
    if (!dueDate) {
      throw new Error(`${index + 1}회차 납부 예정일을 정확히 입력해 주세요.`);
    }

    return {
      index,
      amount,
      dueDate,
    };
  });

  const totalAmount = normalized.reduce((sum, item) => sum + item.amount, 0);
  if (totalAmount !== expectedTotal) {
    throw new Error("분할 납부 일정 금액 합계가 결제 예정 금액과 일치해야 합니다.");
  }

  return normalized
    .sort((left, right) => {
      const dateDiff = left.dueDate.getTime() - right.dueDate.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }

      return left.index - right.index;
    })
    .map(({ amount, dueDate }) => ({ amount, dueDate }));
}
