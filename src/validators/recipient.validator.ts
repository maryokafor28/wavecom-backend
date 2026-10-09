const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

// Strips spaces, dashes, dots, and parentheses so "+234 701-234-5678"
// is accepted and stored in one canonical form.
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

export function isValidPhone(phone: string): boolean {
  return E164_PATTERN.test(phone);
}
