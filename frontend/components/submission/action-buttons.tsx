"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submissions, type Submission, type UserRole } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Send,
  CheckCircle,
  XCircle,
  Upload,
  Pencil,
  Trash2,
  RefreshCw,
} from "lucide-react";

interface ActionButtonsProps {
  submission: Submission;
  userRole: UserRole;
  userId: string;
  onUpdate?: (updated: Submission) => void;
  /** Base path prefix for navigation links (default: "/abstracts") */
  basePath?: string;
}

export function ActionButtons({
  submission,
  userRole,
  userId,
  onUpdate,
  basePath = "/abstracts",
}: ActionButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const isOwner = submission.presenting_author_id === userId;
  const isAdmin = userRole === "admin";
  const isProgramChair = userRole === "program_chair";

  const handle = async (action: string, fn: () => Promise<Submission>) => {
    setLoading(action);
    try {
      const updated = await fn();
      toast({ title: "Success", description: `Abstract ${action} successfully.`, variant: "default" });
      onUpdate?.(updated);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    setLoading("delete");
    try {
      await submissions.delete(submission.id);
      toast({ title: "Deleted", description: "Draft deleted." });
      // Navigate to the abstracts list — root for submitters, /admin/abstracts for admins
      router.push(basePath === "/abstracts" ? "/" : "/admin/abstracts");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const buttons: React.ReactNode[] = [];

  // Submitter actions
  if (isOwner || isAdmin) {
    // Admins can edit any submission; submitters can only edit drafts
    if (isAdmin || submission.status === "draft") {
      buttons.push(
        <Button
          key="edit"
          variant="outline"
          size="sm"
          onClick={() => router.push(`${basePath}/${submission.id}/edit`)}
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Button>,
      );
    }

    if (submission.status === "draft") {
      buttons.push(
        <Button
          key="submit"
          size="sm"
          loading={loading === "submit"}
          onClick={() => handle("submitted", () => submissions.submit(submission.id))}
        >
          <Send className="h-4 w-4" />
          Submit
        </Button>,
        <Button
          key="delete"
          variant="destructive"
          size="sm"
          loading={loading === "delete"}
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>,
      );
    }

    if (submission.status === "notified") {
      buttons.push(
        <Button
          key="confirm"
          size="sm"
          loading={loading === "confirm"}
          onClick={() => handle("confirmed", () => submissions.confirm(submission.id))}
        >
          <CheckCircle className="h-4 w-4" />
          Confirm Participation
        </Button>,
        <Button
          key="withdraw"
          variant="destructive"
          size="sm"
          loading={loading === "withdraw"}
          onClick={() => handle("withdrawn", () => submissions.withdraw(submission.id))}
        >
          <XCircle className="h-4 w-4" />
          Withdraw
        </Button>,
      );
    }

    if (submission.status === "confirmed") {
      buttons.push(
        <Button
          key="submit-files"
          size="sm"
          onClick={() => router.push(`${basePath}/${submission.id}/upload`)}
        >
          <Upload className="h-4 w-4" />
          Submit Files
        </Button>,
      );
    }
  }

  // Program chair actions
  if ((isProgramChair || isAdmin) && submission.status === "files_submitted") {
    buttons.push(
      <Button
        key="request-replacement"
        variant="outline"
        size="sm"
        loading={loading === "request-replacement"}
        onClick={() =>
          handle("reset to confirmed", () =>
            submissions.requestFileReplacement(submission.id),
          )
        }
      >
        <RefreshCw className="h-4 w-4" />
        Request File Replacement
      </Button>,
    );
  }

  if (buttons.length === 0) return null;

  return <div className="flex flex-wrap gap-2">{buttons}</div>;
}
