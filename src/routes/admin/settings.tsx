import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, ListSkeleton } from "@/components/kit";
import { WorkflowFeedback } from "@/components/WorkflowFeedback";
import { workflowRequest } from "@/lib/workflow-client";
import { peso, shortDate } from "@/lib/format";
import type { ViolationCode } from "@/types";

type RuleVersion = {
  version: number;
  dueDays: number;
  catalog: ViolationCode[];
  officeInformation: string;
  reason: string;
  createdAt: string | null;
};
const input =
  "min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";
export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<RuleVersion | null>(null);
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const result = useQuery({
    queryKey: ["workflow", "settings"],
    queryFn: ({ signal }) =>
      workflowRequest<{ settings: RuleVersion[] }>("/api/workflow/settings", {
        signal,
      }),
  });
  const current = result.data?.settings[0];
  const updateViolation = (index: number, change: Partial<ViolationCode>) =>
    setEditing((previous) =>
      previous
        ? {
            ...previous,
            catalog: previous.catalog.map((entry, i) =>
              i === index ? { ...entry, ...change } : entry,
            ),
          }
        : previous,
    );
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || saving || !approved) return;
    setError("");
    const catalog = editing.catalog.map((entry) => ({
      ...entry,
      code: entry.code.trim(),
      label: entry.label.trim(),
      category: entry.category.trim(),
    }));
    if (new Set(catalog.map((entry) => entry.code)).size !== catalog.length) {
      setError("Every violation needs a unique code.");
      return;
    }
    setSaving(true);
    try {
      await workflowRequest("/api/workflow/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersion: editing.version,
          dueDays: editing.dueDays,
          catalog,
          officeInformation: editing.officeInformation.trim(),
          reason: reason.trim(),
        }),
      });
      setEditing(null);
      setReason("");
      setApproved(false);
      await client.invalidateQueries({ queryKey: ["workflow", "settings"] });
      toast.success(
        "New rule version saved. Existing citation fines and due dates are preserved.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to save this rule version.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Approved municipal rules"
        title="Citation settings"
        description="Version the fine catalog, payment deadline, and Treasury assistance information used for new citations."
        icon={Settings2}
        actions={
          !editing && current ? (
            <button
              onClick={() => {
                setEditing({
                  ...current,
                  catalog: current.catalog.map((entry) => ({ ...entry })),
                });
                setReason("");
                setApproved(false);
                setError("");
              }}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              Prepare a new version
            </button>
          ) : undefined
        }
      />
      <WorkflowFeedback
        error={result.error}
        loading={result.isFetching}
        updatedAt={result.dataUpdatedAt}
        onRetry={() => void result.refetch()}
      />
      {result.isPending ? (
        <ListSkeleton rows={6} />
      ) : editing ? (
        <form onSubmit={save} className="space-y-6">
          <fieldset disabled={saving} className="space-y-6">
            <SectionCard
              title={`New version based on version ${editing.version}`}
              description="Changes apply when new citations are issued. Existing records retain their original fine and due date."
              bodyClassName="space-y-4 p-5"
            >
              <label className="block max-w-sm space-y-1.5 text-xs font-semibold text-muted-foreground">
                Days allowed for payment
                <input
                  type="number"
                  required
                  min={1}
                  max={365}
                  step={1}
                  value={editing.dueDays}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      dueDays: Number(event.target.value),
                    })
                  }
                  className={input}
                />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
                Treasury assistance information
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={editing.officeInformation}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      officeInformation: event.target.value,
                    })
                  }
                  className={`${input} py-3`}
                  placeholder="Approved office location, business hours, contact details, and payment instructions."
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Assistance information appears in the public portal. Include
                only approved municipal contact information.
              </p>
            </SectionCard>
            <SectionCard
              title="Violation catalog"
              actions={
                <button
                  type="button"
                  disabled={editing.catalog.length >= 500}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      catalog: [
                        ...editing.catalog,
                        { code: "", label: "", category: "", fine: 1 },
                      ],
                    })
                  }
                  className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  Add violation
                </button>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      {["Code", "Violation", "Category", "Fine (PHP)", ""].map(
                        (label, index) => (
                          <th key={index} className="px-4 py-3 font-semibold">
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {editing.catalog.map((entry, index) => (
                      <tr key={index}>
                        <td className="min-w-32 px-4 py-3">
                          <input
                            aria-label={`Violation ${index + 1} code`}
                            required
                            maxLength={200}
                            value={entry.code}
                            onChange={(event) =>
                              updateViolation(index, {
                                code: event.target.value,
                              })
                            }
                            className={input}
                          />
                        </td>
                        <td className="min-w-60 px-4 py-3">
                          <input
                            aria-label={`Violation ${index + 1} name`}
                            required
                            maxLength={200}
                            value={entry.label}
                            onChange={(event) =>
                              updateViolation(index, {
                                label: event.target.value,
                              })
                            }
                            className={input}
                          />
                        </td>
                        <td className="min-w-40 px-4 py-3">
                          <input
                            aria-label={`Violation ${index + 1} category`}
                            required
                            maxLength={200}
                            value={entry.category}
                            onChange={(event) =>
                              updateViolation(index, {
                                category: event.target.value,
                              })
                            }
                            className={input}
                          />
                        </td>
                        <td className="min-w-32 px-4 py-3">
                          <input
                            aria-label={`Violation ${index + 1} fine in pesos`}
                            type="number"
                            required
                            min={1}
                            max={1000000}
                            step={1}
                            value={entry.fine}
                            onChange={(event) =>
                              updateViolation(index, {
                                fine: Number(event.target.value),
                              })
                            }
                            className={input}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            aria-label={`Remove ${entry.label || `violation ${index + 1}`}`}
                            disabled={editing.catalog.length <= 1}
                            onClick={() =>
                              setEditing({
                                ...editing,
                                catalog: editing.catalog.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                            className="flex size-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-40"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
            <SectionCard
              title="Approval reference"
              bodyClassName="space-y-4 p-5"
            >
              <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
                Reason and municipal approval reference
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={`${input} py-3`}
                  placeholder="Describe the approved change and cite the municipal authorization."
                />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                  className="mt-0.5 size-5 accent-primary"
                />
                <span>
                  I confirm that this version reflects approved municipal rules
                  and is ready to apply to newly issued citations.
                </span>
              </label>
            </SectionCard>
          </fieldset>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(null)}
              className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold disabled:opacity-50"
            >
              Cancel changes
            </button>
            <button
              disabled={saving || !approved || reason.trim().length < 3}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving version…" : "Save approved version"}
            </button>
          </div>
        </form>
      ) : current ? (
        <>
          <SectionCard
            title={`Current rules · version ${current.version}`}
            description={`Payment deadline: ${current.dueDays} days after issuance. ${current.createdAt ? `Saved ${shortDate(current.createdAt)}.` : "Existing municipal catalog."}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Code</th>
                    <th className="px-5 py-3">Violation</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3 text-right">Fine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {current.catalog.map((entry) => (
                    <tr key={entry.code}>
                      <td className="px-5 py-3 font-mono text-xs">
                        {entry.code}
                      </td>
                      <td className="px-5 py-3">{entry.label}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {entry.category}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">
                        {peso(entry.fine)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border p-5 text-sm">
              <h2 className="font-semibold">Treasury assistance</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                {current.officeInformation ||
                  "No assistance information has been configured."}
              </p>
            </div>
          </SectionCard>
          <SectionCard
            title="Version history"
            description="The saved reason documents each rule change."
            bodyClassName="divide-y divide-border"
          >
            {result.data?.settings.map((version) => (
              <div key={version.version} className="p-5 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">
                    Version {version.version} · {version.dueDays} payment days ·{" "}
                    {version.catalog.length} violations
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {version.createdAt
                      ? shortDate(version.createdAt)
                      : "Initial rules"}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                  {version.reason}
                </p>
              </div>
            ))}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
