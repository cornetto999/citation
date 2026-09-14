import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Camera,
  Check,
  ChevronRight,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EnforcerSidebar } from "@/components/EnforcerSidebar";
import { useTicketStore } from "@/store/useTicketStore";
import { VEHICLE_TYPES, VIOLATION_CODES } from "@/lib/mockData";
import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Ticket, ViolationCode } from "@/types";

export const Route = createFileRoute("/enforcer/new")({
  head: () => ({
    meta: [
      { title: "Fast Citation Entry | Traffic Enforcer" },
      {
        name: "description",
        content:
          "Mobile-first roadside citation entry with quick violation picks, plate capture, and one-tap issuance.",
      },
      {
        property: "og:title",
        content: "Fast Citation Entry | Traffic Enforcer",
      },
      {
        property: "og:description",
        content: "Issue a traffic citation from the field in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnforcerPage,
});

const emptyForm = {
  plateNo: "",
  vehicleType: "",
  violatorName: "",
  licenseNo: "",
  location: "",
  remarks: "",
};

function EnforcerPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const addTicket = useTicketStore((s) => s.addTicket);

  useEffect(() => {
    if (!user || user.role !== "enforcer") {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  const [form, setForm] = useState(emptyForm);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [violationQuery, setViolationQuery] = useState("");
  const [picked, setPicked] = useState<ViolationCode[]>([]);
  const [photoName, setPhotoName] = useState<string>();
  const [issued, setIssued] = useState<Ticket | null>(null);
  const plateRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof emptyForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const vehicleMatches = useMemo(() => {
    if (!vehicleQuery) return [];
    const q = vehicleQuery.toLowerCase();
    return VEHICLE_TYPES.filter(
      (v) => v.toLowerCase().includes(q) && v.toLowerCase() !== q,
    ).slice(0, 4);
  }, [vehicleQuery]);

  const violationMatches = useMemo(() => {
    const q = violationQuery.toLowerCase();
    return VIOLATION_CODES.filter(
      (v) =>
        !picked.some((p) => p.code === v.code) &&
        (v.label.toLowerCase().includes(q) ||
          v.code.toLowerCase().includes(q) ||
          v.category.toLowerCase().includes(q) ||
          v.fine.toString().includes(q)),
    ).slice(0, 6);
  }, [violationQuery, picked]);

  const total = picked.reduce((sum, v) => sum + v.fine, 0);
  const canSubmit =
    form.plateNo.trim() && form.vehicleType.trim() && picked.length > 0;

  const reset = () => {
    setForm(emptyForm);
    setVehicleQuery("");
    setViolationQuery("");
    setPicked([]);
    setPhotoName(undefined);
    setIssued(null);
    plateRef.current?.focus();
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const ticket = await addTicket({
        plateNo: form.plateNo.toUpperCase().trim(),
        vehicleType: form.vehicleType.trim(),
        violatorName: form.violatorName.trim() || "Unidentified Driver",
        licenseNo: form.licenseNo.trim().toUpperCase() || "N/A",
        violations: picked,
        location: form.location.trim(),
        remarks: form.remarks.trim() || undefined,
        photoName,
        issuedBy: user!.name,
      });
      setIssued(ticket);
      toast.success(`Citation ${ticket.id} issued successfully.`);
    } catch (e) {
      toast.error("Failed to issue citation");
    }
  };

  if (!user || user.role !== "enforcer") return null;
  const officer = user;

  if (issued) {
    return (
      <AppShell
        title="Citation Issued"
        subtitle="Hand the printed slip to the motorist"
        operator={officer.name}
        unit={`Badge ${officer.credential}`}
        accessLabel="Enforcer"
        className="max-w-md pb-24"
      >
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-panel">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-paid text-paid-foreground">
            <Check className="size-7" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Ticket number</p>
          <p className="font-mono text-2xl font-bold text-card-foreground">
            {issued.id}
          </p>
          <div className="mt-5 space-y-2 rounded-lg bg-muted p-4 text-left text-sm">
            <Row label="Plate" value={issued.plateNo} />
            <Row label="Vehicle" value={issued.vehicleType} />
            <Row
              label="Violations"
              value={issued.violations.map((v) => v.label).join(", ")}
            />
            <Row label="Total fine" value={peso(issued.totalFine)} />
            <Row
              label="Pay before"
              value={new Date(issued.dueDate).toLocaleDateString("en-PH")}
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Motorist may settle at the Municipal Treasury or online via QRPh
            using this ticket number.
          </p>
          <button
            onClick={reset}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground active:scale-[0.99]"
          >
            <RotateCcw className="size-5" /> Issue another citation
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Fast Citation Entry"
      subtitle="Roadside issuance · offline-ready"
      operator={officer.name}
      unit={`Badge ${officer.credential}`}
      accessLabel="Enforcer"
      className="max-w-md pb-40"
      sidebar={<EnforcerSidebar />}
    >
      <div className="space-y-5">
        <Field label="Plate number" hint="Required">
          <input
            ref={plateRef}
            value={form.plateNo}
            onChange={(e) => set("plateNo", e.target.value.toUpperCase())}
            placeholder="ABC 1234"
            autoCapitalize="characters"
            className="h-16 w-full rounded-lg border-2 border-input bg-card px-4 text-center font-mono text-2xl font-bold tracking-widest uppercase outline-none focus:border-ring"
          />
        </Field>

        <Field label="Vehicle type" hint="Required">
          <input
            value={form.vehicleType}
            onChange={(e) => {
              set("vehicleType", e.target.value);
              setVehicleQuery(e.target.value);
            }}
            placeholder="Start typing…"
            className="h-14 w-full rounded-lg border-2 border-input bg-card px-4 text-base outline-none focus:border-ring"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {(vehicleMatches.length
              ? vehicleMatches
              : VEHICLE_TYPES.slice(0, 4)
            ).map((v) => (
              <button
                key={v}
                onClick={() => {
                  set("vehicleType", v);
                  setVehicleQuery("");
                }}
                className={cn(
                  "h-11 rounded-full border border-border px-4 text-sm font-medium active:scale-95",
                  form.vehicleType === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-card-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Violations" hint={`${picked.length} selected`}>
          {picked.length > 0 && (
            <div className="mb-3 space-y-2">
              {picked.map((v) => (
                <div
                  key={v.code}
                  className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-secondary-foreground">
                      {v.label}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {v.code} · {peso(v.fine)}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setPicked((p) => p.filter((x) => x.code !== v.code))
                    }
                    aria-label={`Remove ${v.label}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card active:scale-95"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={violationQuery}
              onChange={(e) => setViolationQuery(e.target.value)}
              placeholder="Search violation or code…"
              className="h-14 w-full rounded-lg border-2 border-input bg-card pl-10 pr-4 text-base outline-none focus:border-ring"
            />
          </div>
          <div className="mt-2 space-y-1.5">
            {violationMatches.map((v) => (
              <button
                key={v.code}
                onClick={() => {
                  setPicked((p) => [...p, v]);
                  setViolationQuery("");
                }}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-left active:scale-[0.99]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {v.label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {v.code} · {v.category}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular">
                  {peso(v.fine)}
                </span>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4">
          <Field label="Driver name" hint="Optional">
            <input
              value={form.violatorName}
              onChange={(e) => set("violatorName", e.target.value)}
              placeholder="Surname, First name"
              className="h-14 w-full rounded-lg border-2 border-input bg-card px-4 text-base outline-none focus:border-ring"
            />
          </Field>
          <Field label="License number" hint="Optional">
            <input
              value={form.licenseNo}
              onChange={(e) => set("licenseNo", e.target.value.toUpperCase())}
              placeholder="N01-23-456789"
              className="h-14 w-full rounded-lg border-2 border-input bg-card px-4 font-mono text-base outline-none focus:border-ring"
            />
          </Field>
          <Field label="Location" hint="Optional">
            <input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Street / barangay"
              className="h-14 w-full rounded-lg border-2 border-input bg-card px-4 text-base outline-none focus:border-ring"
            />
          </Field>
          <Field label="Remarks" hint="Optional">
            <textarea
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              rows={2}
              placeholder="Notes for the hearing officer"
              className="w-full resize-none rounded-lg border-2 border-input bg-card p-4 text-base outline-none focus:border-ring"
            />
          </Field>
        </div>

        <Field label="Evidence photo" hint={photoName ? "Attached" : "Optional"}>
          {photoName ? (
            <div className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-paid-foreground/40 bg-paid text-paid-foreground text-sm font-medium">
              <Camera className="size-6" />
              <span className="max-w-[90%] truncate px-2">Attached · {photoName}</span>
              <button
                onClick={() => setPhotoName(undefined)}
                className="mt-1 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
              >
                Remove photo
              </button>
            </div>
          ) : (
            <label className="flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-card text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.99]">
              <Camera className="size-6" />
              <span>Tap to capture photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPhotoName(file.name);
                  }
                }}
              />
            </label>
          )}
        </Field>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total fine
            </p>
            <p className="font-display text-xl font-bold tabular">
              {peso(total)}
            </p>
          </div>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-opacity active:scale-[0.99] disabled:opacity-40"
          >
            Issue citation <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-sm font-semibold text-foreground">{label}</label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
