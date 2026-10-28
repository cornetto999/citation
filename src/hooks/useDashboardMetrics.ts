import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workflowRequest } from "@/lib/workflow-client";
import { emptySummary } from "@/lib/workflow-data";
import { useAuthStore } from "@/store/useAuthStore";
import type { Payment } from "@/types";
export function channelGroup(channel: Payment["channel"] | undefined) {
  if (!channel) return "Other";
  if (channel.startsWith("Cash")) return "Cash (OTC)";
  if (channel === "GCash" || channel === "Maya") return channel;
  return "Online / QRPh";
}
export function useDashboardMetrics() {
  const user = useAuthStore((s) => s.user);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["workflow-summary", user?.key],
    queryFn: () =>
      workflowRequest<typeof emptySummary>("/api/workflow/summary"),
    enabled: Boolean(user && user.role !== "violator"),
    refetchInterval: 60000,
    staleTime: 15000,
  });
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["workflow-summary"] });
    };
    window.addEventListener("citation-data-changed", refresh);
    return () => window.removeEventListener("citation-data-changed", refresh);
  }, [client]);
  return {
    ...emptySummary,
    ...query.data,
    loading: query.isPending,
    error: query.error,
    updatedAt: query.dataUpdatedAt,
    refresh: query.refetch,
  };
}
