import { createFileRoute } from "@tanstack/react-router";
import { FollowUpQueue } from "@/components/FollowUpQueue";

export const Route = createFileRoute("/treasury/followups")({
  head: () => ({ meta: [{ title: "Follow-up Queue | Municipal Treasury" }] }),
  component: FollowUpQueue,
});
