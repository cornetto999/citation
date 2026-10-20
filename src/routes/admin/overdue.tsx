import { createFileRoute } from "@tanstack/react-router";
import { OverdueBoard } from "@/components/OverdueBoard";

export const Route = createFileRoute("/admin/overdue")({
  head: () => ({
    meta: [
      { title: "Overdue Citations | Admin Portal" },
      {
        name: "description",
        content:
          "Track overdue traffic citations, amounts owed, and endorse cases to the PNP for enforcement.",
      },
    ],
  }),
  component: () => <OverdueBoard role="admin" />,
});
