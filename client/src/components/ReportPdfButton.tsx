import { Button } from "@/components/ui";
import { printDomElement } from "@/lib/download";
import { getStoredOrganizationTitle } from "@/lib/orgStorage";

export function ReportPdfButton({
  title,
  targetRef,
  disabled,
}: {
  title: string;
  targetRef: React.RefObject<HTMLElement | null>;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={() => {
        const el = targetRef.current;
        if (!el) return;
        printDomElement(title, el, { orgTitle: getStoredOrganizationTitle() });
      }}
    >
      PDF
    </Button>
  );
}
