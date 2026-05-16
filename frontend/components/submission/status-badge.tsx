import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { SubmissionStatus } from "@/lib/api";

const statusConfig: Record<SubmissionStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Submitted", variant: "info" },
  under_review: { label: "Under Review", variant: "warning" },
  decided: { label: "Decided", variant: "purple" },
  assigned_to_session: { label: "Assigned to Session", variant: "indigo" },
  notified: { label: "Notified", variant: "orange" },
  confirmed: { label: "Confirmed", variant: "success" },
  files_submitted: { label: "Files Submitted", variant: "teal" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
};

interface StatusBadgeProps {
  status: SubmissionStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: "secondary" as BadgeVariant };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
