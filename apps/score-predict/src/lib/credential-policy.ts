export function normalizeCaseInsensitivePassword(password: string): string {
  return password.trim().toLowerCase();
}

export function passwordsMatchIgnoringCase(left: string, right: string): boolean {
  return normalizeCaseInsensitivePassword(left) === normalizeCaseInsensitivePassword(right);
}
