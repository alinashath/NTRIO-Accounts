const LS_ACTIVE_ORG = "ntrio_active_organization_id";
const LS_ORG_TITLE = "ntrio_organization_title";
const SS_CHOOSE_ORG = "ntrio_choose_organization";
const DEFAULT_ORG_TITLE = "NTRIO";

/** Set on sign-in so more than one organization always asks before opening the books. */
export function markOrganizationChoiceRequired() {
  sessionStorage.setItem(SS_CHOOSE_ORG, "1");
  clearStoredActiveOrganization();
}

export function isOrganizationChoiceRequired(): boolean {
  return sessionStorage.getItem(SS_CHOOSE_ORG) === "1";
}

export function clearOrganizationChoiceRequired() {
  sessionStorage.removeItem(SS_CHOOSE_ORG);
}

export function getStoredActiveOrganizationId(): string | null {
  return localStorage.getItem(LS_ACTIVE_ORG)?.trim() || null;
}

export function setStoredActiveOrganization(org: { id: string; title: string }) {
  localStorage.setItem(LS_ACTIVE_ORG, org.id);
  localStorage.setItem(LS_ORG_TITLE, org.title);
  applyDocumentTitle(org.title);
}

export function clearStoredActiveOrganization() {
  localStorage.removeItem(LS_ACTIVE_ORG);
}

export function getStoredOrganizationTitle(): string {
  return localStorage.getItem(LS_ORG_TITLE)?.trim() || DEFAULT_ORG_TITLE;
}

export function setStoredOrganizationTitle(title: string) {
  const next = title.trim() || DEFAULT_ORG_TITLE;
  localStorage.setItem(LS_ORG_TITLE, next);
  applyDocumentTitle(next);
  return next;
}

/** Browser tab / PWA title follows the active organization. */
export function applyDocumentTitle(title?: string | null) {
  const next = title?.trim() || getStoredOrganizationTitle();
  if (typeof document !== "undefined") {
    document.title = next;
  }
  return next;
}
