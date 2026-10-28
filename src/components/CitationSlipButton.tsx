import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import type { Ticket } from "@/types";
import { prepareCitationSlip, showCitationSlip } from "@/lib/citation-slip";
import { workflowRequest } from "@/lib/workflow-client";

export function CitationSlipButton({
  ticket,
  reload = false,
}: {
  ticket: Ticket;
  reload?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const print = async () => {
    // Open synchronously from the click so browsers do not reject the preview.
    const preview = window.open("", "_blank");
    if (!preview) {
      toast.error("Allow pop-ups to open the citation print preview.");
      return;
    }
    preview.opener = null;
    preview.document.title = "Preparing citation slip";
    preview.document.body.textContent = "Preparing citation slip…";
    setLoading(true);
    try {
      const printable = reload
        ? (
            await workflowRequest<{ ticket: Ticket }>(
              `/api/workflow/tickets/${encodeURIComponent(ticket.id)}`,
            )
          ).ticket
        : ticket;
      const html = await prepareCitationSlip(printable, window.location.origin);
      showCitationSlip(preview, html);
    } catch (error) {
      preview.close();
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to prepare the citation slip. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void print()}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Printer className="size-4" />
      )}
      {loading ? "Preparing…" : "Print citation slip"}
    </button>
  );
}
