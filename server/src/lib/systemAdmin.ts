/** Dedicated system admin (approves new organization / tenant setup). */
export const DEFAULT_SYSTEM_ADMIN_EMAIL = "ali.nashath@outlook.com";

export function getSystemAdminEmail(): string {
  return (process.env.SYSTEM_ADMIN_EMAIL?.trim() || DEFAULT_SYSTEM_ADMIN_EMAIL).toLowerCase();
}

export function isSystemAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === getSystemAdminEmail();
}
