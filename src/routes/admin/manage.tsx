import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Users, Shield, BadgeCheck, Loader2, Plus, X } from "lucide-react";
import { UserDetailsDialog } from "@/components/UserDetailsDialog";
import { useAuthStore } from "@/store/useAuthStore";
import type { User, Role } from "@/types";

export const Route = createFileRoute("/admin/manage")({
  component: AdminManageUsers,
});

function AdminManageUsers() {
  const currentUser = useAuthStore((state) => state.user);
  const signIn = useAuthStore((state) => state.signIn);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const resendingRef = useRef(false);
  const detailsTriggerRef = useRef<HTMLTableRowElement | null>(null);
  const addUserButtonRef = useRef<HTMLButtonElement | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    credential: "",
    role: "enforcer" as Role,
    unit: "",
  });

  const fetchUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError("");
    setNeedsLogin(false);
    try {
      const response = await fetch("/api/admin/users", {
        signal: signal ?? null,
      });
      const result = (await response.json()) as {
        users?: User[];
        error?: string;
      };
      if (!response.ok) {
        if (!signal?.aborted) setNeedsLogin(response.status === 401);
        throw new Error(result.error || "Unable to load users. Please retry.");
      }
      if (!Array.isArray(result.users)) {
        throw new Error("Unable to load users. Please retry.");
      }
      if (!signal?.aborted) setUsers(result.users);
    } catch (error) {
      if (!signal?.aborted) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load users. Please retry.",
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUsers(controller.signal);
    return () => controller.abort();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setActionError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          name: formData.name.trim(),
          credential: formData.credential.trim().toLowerCase(),
          unit: formData.unit.trim(),
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Unable to invite user. Please retry.");
      }
      setSuccessMessage(
        result.message ||
          "Invitation sent. The user must verify their email and set a password before signing in.",
      );
      setIsModalOpen(false);
      setFormData({
        name: "",
        credential: "",
        role: "enforcer",
        unit: "",
      });
      await fetchUsers();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to invite user. Please retry.",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleResendInvitation = async (userId: string) => {
    if (resendingRef.current || submittingRef.current) return;
    resendingRef.current = true;
    setResendingUserId(userId);
    setActionError("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/admin/users/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error || "Unable to resend the invitation. Please retry.",
        );
      }
      setSuccessMessage(
        result.message ||
          "A new verification link has been sent to the user's email.",
      );
      await fetchUsers();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to resend the invitation. Please retry.",
      );
    } finally {
      resendingRef.current = false;
      setResendingUserId(null);
    }
  };

  const openUserDetails = (user: User, row: HTMLTableRowElement) => {
    if (submittingRef.current || resendingRef.current || needsLogin) return;
    detailsTriggerRef.current = row;
    setActionError("");
    setSuccessMessage("");
    setSelectedUser(user);
  };

  const restoreDetailsFocus = () => {
    requestAnimationFrame(() => {
      const row = detailsTriggerRef.current;
      if (row?.isConnected) row.focus();
      else addUserButtonRef.current?.focus();
    });
  };

  const handleUserUpdated = (updatedUser: User) => {
    setUsers((previous) =>
      previous.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
    );
    setSelectedUser(updatedUser);
    if (currentUser?.key === updatedUser.id) {
      signIn({
        key: updatedUser.id,
        name: updatedUser.name,
        credential: updatedUser.credential,
        role: updatedUser.role,
        unit: updatedUser.unit,
      });
    }
  };

  const handleUserDeleted = (userId: string, message: string) => {
    setUsers((previous) => previous.filter((user) => user.id !== userId));
    setSelectedUser(null);
    setSuccessMessage(message);
  };

  return (
    <Dialog.Root
      open={isModalOpen}
      onOpenChange={(open) => {
        if (submittingRef.current) return;
        setIsModalOpen(open);
        if (open) setError("");
      }}
    >
      <div className="space-y-6 max-w-5xl mx-auto py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
              <Users className="size-8 text-sidebar-primary" />
              Manage Users
            </h1>
            <p className="text-muted-foreground mt-2">
              View and manage all registered system accounts across the
              municipality.
            </p>
          </div>
          <Dialog.Trigger asChild>
            <button
              ref={addUserButtonRef}
              disabled={isSubmitting || resendingUserId !== null || needsLogin}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
            >
              <Plus className="size-5" />
              Add User
            </button>
          </Dialog.Trigger>
        </div>

        {successMessage && (
          <p
            role="status"
            className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
          >
            {successMessage}
          </p>
        )}
        {actionError && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}
        {loadError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <p>
              {needsLogin
                ? "Sign in again to manage users. Existing accounts are unchanged."
                : loadError}
            </p>
            {needsLogin ? (
              <Link
                to="/login"
                className="shrink-0 rounded-md border border-destructive/30 px-3 py-1.5 font-medium"
              >
                Sign in
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void fetchUsers()}
                disabled={loading}
                className="shrink-0 rounded-md border border-destructive/30 px-3 py-1.5 font-medium disabled:opacity-50"
              >
                Retry
              </button>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Select any user row to view details, edit their account, update their
          password, or delete the user.
        </p>
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading && users.length === 0 ? (
            <div role="status" className="flex justify-center p-12">
              <Loader2
                aria-hidden="true"
                className="size-8 animate-spin text-primary/50"
              />
              <span className="sr-only">Loading users</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Name</th>
                    <th className="px-6 py-4 font-medium">Email / Badge no.</th>
                    <th className="px-6 py-4 font-medium">Email status</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium">Assigned Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      tabIndex={
                        isSubmitting || resendingUserId !== null || needsLogin
                          ? -1
                          : 0
                      }
                      aria-label={`View and manage ${user.name}`}
                      aria-haspopup="dialog"
                      aria-disabled={
                        isSubmitting || resendingUserId !== null || needsLogin
                      }
                      onClick={(event) =>
                        openUserDetails(user, event.currentTarget)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.target === event.currentTarget &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          openUserDetails(user, event.currentTarget);
                        }
                      }}
                      className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary aria-disabled:cursor-default"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold uppercase">
                            {user.name.charAt(0)}
                          </div>
                          <span className="font-medium text-foreground">
                            {user.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {user.credential}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span>
                            {user.emailVerifiedAt
                              ? "Verified"
                              : user.emailVerificationRequired
                                ? "Pending verification"
                                : "Legacy account"}
                          </span>
                          {user.emailVerificationRequired &&
                            !user.emailVerifiedAt && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleResendInvitation(user.id);
                                }}
                                disabled={
                                  resendingUserId !== null ||
                                  isSubmitting ||
                                  needsLogin
                                }
                                aria-label={`Resend verification link to ${user.credential}`}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                              >
                                {resendingUserId === user.id && (
                                  <Loader2
                                    aria-hidden="true"
                                    className="size-3 animate-spin"
                                  />
                                )}
                                {resendingUserId === user.id
                                  ? "Resending…"
                                  : "Resend link"}
                              </button>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider
                        ${user.role === "admin" ? "bg-indigo-100 text-indigo-700" : ""}
                        ${user.role === "enforcer" ? "bg-blue-100 text-blue-700" : ""}
                        ${user.role === "pnp" ? "bg-rose-100 text-rose-700" : ""}
                        ${user.role === "treasury" ? "bg-amber-100 text-amber-700" : ""}
                        ${user.role === "violator" ? "bg-muted text-foreground" : ""}
                      `}
                        >
                          {user.role === "admin" && (
                            <Shield className="size-3" />
                          )}
                          {user.role === "pnp" && <Shield className="size-3" />}
                          {user.role === "enforcer" && (
                            <BadgeCheck className="size-3" />
                          )}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {user.unit}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && !loadError && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-muted-foreground"
                      >
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md max-h-[calc(100dvh_-_2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-popover shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Add New User
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close Add User dialog"
                  disabled={isSubmitting}
                  className="text-muted-foreground hover:text-muted-foreground"
                >
                  <X className="size-5" />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleCreateUser} className="p-6">
              <Dialog.Description className="mb-5 text-sm text-muted-foreground">
                An invitation link will be sent to this email, including Gmail
                addresses. The user must open it to verify their email and set
                their own password before signing in.
              </Dialog.Description>
              <fieldset disabled={isSubmitting} className="space-y-4">
                <div>
                  <label
                    htmlFor="new-user-name"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Full Name
                  </label>
                  <input
                    id="new-user-name"
                    autoComplete="name"
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="e.g. Jake Roaya"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-user-email"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Email
                  </label>
                  <input
                    id="new-user-email"
                    autoComplete="email"
                    required
                    type="email"
                    value={formData.credential}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        credential: e.target.value.toLowerCase(),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="e.g. badge123@mail.com"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-user-role"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Role
                  </label>
                  <select
                    id="new-user-role"
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as Role })
                    }
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="enforcer">Traffic Enforcer</option>
                    <option value="pnp">PNP / Police</option>
                    <option value="treasury">Municipal Treasury</option>
                    <option value="admin">System Admin</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="new-user-unit"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Assigned Unit
                  </label>
                  <input
                    id="new-user-unit"
                    required
                    type="text"
                    value={formData.unit}
                    onChange={(e) =>
                      setFormData({ ...formData, unit: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="e.g. Gitagum Traffic Management Office"
                  />
                </div>
              </fieldset>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {isSubmitting ? "Sending invitation…" : "Send Invitation"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
        {selectedUser && (
          <UserDetailsDialog
            key={selectedUser.id}
            user={selectedUser}
            currentUserId={currentUser?.key}
            onClose={() => setSelectedUser(null)}
            onRestoreFocus={restoreDetailsFocus}
            onUserUpdated={handleUserUpdated}
            onUserDeleted={handleUserDeleted}
          />
        )}
      </div>
    </Dialog.Root>
  );
}
