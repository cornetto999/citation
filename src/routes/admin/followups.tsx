import { createFileRoute } from "@tanstack/react-router";
import { FollowUpQueue } from "@/components/FollowUpQueue";

export const Route = createFileRoute("/admin/followups")({
  head: () => ({ meta: [{ title: "Follow-up Queue | Administration" }] }),
  component: FollowUpQueue,
});
