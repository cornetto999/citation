import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { KeyRound, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Role, User } from "@/types";

interface UserDetailsDialogProps {
  user: User;
  currentUserId: string | undefined;
  onClose: () => void;
  onRestoreFocus: () => void;
  onUserUpdated: (user: User) => void;
  onUserDeleted: (userId: string, message: string) => void;
}

interface UserActionResult {
  user?: User;
  message?: string;
  error?: string;
}

const inputClassName =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 read-only:bg-muted/40";
const secondaryButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
const primaryButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

function userForm(user: User) {
  return {
    name: user.name,
    credential: user.credential,
    role: user.role,
    unit: user.unit,
  };
}

async function postUserAction(
  path: string,
  body: object,
  fallback: string,
): Promise<UserActionResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as UserActionResult;
  if (!response.ok) throw new Error(result.error || fallback);
  return result;
}

export function UserDetailsDialog({
  user,
  currentUserId,
  onClose,
  onRestoreFocus,
  onUserUpdated,
  onUserDeleted,
}: UserDetailsDialogProps) {
  const [account, setAccount] = useState(user);
  const [formData, setFormData] = useState(() => userForm(user));
  const [isEditing, setIsEditing] = useState(false);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [action, setAction] = useState<"save" | "password" | "delete" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const busyRef = useRef(false);
  const isBusy = action !== null;
  const isOwnAccount = account.id === currentUserId;
  const verificationPending =
    account.emailVerificationRequired && !account.emailVerifiedAt;
  const emailStatus = account.emailVerifiedAt
    ? "Verified"
    : verificationPending
      ? "Pending verification"
      : "Legacy account";

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setAction("save");
    setError("");
    setSuccess("");
    try {
      const result = await postUserAction(
        "/api/admin/users/update",
        {
          userId: account.id,
          name: formData.name.trim(),
          credential: formData.credential.trim(),
          role: formData.role,
          unit: formData.unit.trim(),
        },
        "Unable to update the user. Please retry.",
      );
      if (!result.user || result.user.id !== account.id) {
        throw new Error(
          "Unable to confirm the saved user details. Please retry.",
        );
      }
      setAccount(result.user);
      setFormData(userForm(result.user));
      setIsEditing(false);
      onUserUpdated(result.user);
      const message = result.message || "User details updated.";
      setSuccess(message);
      toast.success(message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update the user. Please retry.";
      setError(message);
      toast.error("Could not update user", { description: message });
    } finally {
      busyRef.current = false;
      setAction(null);
    }
  };

  const handlePasswordUpdate = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (busyRef.current || verificationPending) return;
    setError("");
    setSuccess("");
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      toast.error("Use a password with at least 8 characters.", {
        id: "user-password-validation",
      });
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      toast.error("The passwords do not match.", {
        id: "user-password-validation",
      });
      return;
    }
    toast.dismiss("user-password-validation");
    busyRef.current = true;
    setAction("password");
    try {
      const result = await postUserAction(
        "/api/admin/users/password",
        { userId: account.id, password },
        "Unable to update the password. Please retry.",
      );
      setPassword("");
      setConfirmPassword("");
      setIsPasswordFormOpen(false);
      const message = result.message || "Password updated successfully.";
      setSuccess(message);
      toast.success(message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update the password. Please retry.";
      setError(message);
      toast.error("Could not update password", { description: message });
    } finally {
      busyRef.current = false;
      setAction(null);
    }
  };

  const handleDelete = async () => {
    if (busyRef.current || isOwnAccount) return;
    busyRef.current = true;
    setAction("delete");
    setDeleteError("");
    try {
      const result = await postUserAction(
        "/api/admin/users/delete",
        { userId: account.id, confirm: true },
        "Unable to delete the user. Please retry.",
      );
      onUserDeleted(
        account.id,
        result.message || `${account.name} was deleted.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to delete the user. Please retry.";
      setDeleteError(message);
      toast.error("Could not delete user", { description: message });
    } finally {
      busyRef.current = false;
      setAction(null);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busyRef.current && !deleteOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onRestoreFocus();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-xl max-h-[calc(100dvh_-_2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-popover shadow-xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-foreground">
                User details
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                View and manage {account.name}&apos;s account.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close user details"
                disabled={isBusy}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-6 p-6">
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {success && (
              <p
                role="status"
                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground"
              >
                {success}
              </p>
            )}

            <section aria-labelledby="user-profile-heading">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2
                  id="user-profile-heading"
                  className="font-semibold text-foreground"
                >
                  Account details
                </h2>
                {!isEditing && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setError("");
                      setSuccess("");
                      setIsEditing(true);
                    }}
                    className={secondaryButtonClassName}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    Edit details
                  </button>
                )}
              </div>

              {isEditing ? (
                <form onSubmit={handleSave}>
                  <fieldset disabled={isBusy} className="space-y-4">
                    <div>
                      <label
                        htmlFor="edit-user-name"
                        className="mb-1.5 block text-sm font-medium text-foreground"
                      >
                        Full name
                      </label>
                      <input
                        id="edit-user-name"
                        required
                        maxLength={120}
                        autoComplete="name"
                        value={formData.name}
                        onChange={(event) =>
                          setFormData({ ...formData, name: event.target.value })
                        }
                        className={inputClassName}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="edit-user-credential"
                        className="mb-1.5 block text-sm font-medium text-foreground"
                      >
                        Email / badge no.
                      </label>
                      <input
                        id="edit-user-credential"
                        required
                        maxLength={254}
                        readOnly={account.authManaged}
                        aria-describedby={
                          account.authManaged ? "managed-email-note" : undefined
                        }
                        value={formData.credential}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            credential: event.target.value,
                          })
                        }
                        className={inputClassName}
                      />
                      {account.authManaged && (
                        <p
                          id="managed-email-note"
                          className="mt-1.5 text-xs text-muted-foreground"
                        >
                          This email is linked to the verified sign-in account.
                          Changing it requires the user to verify the new email.
                        </p>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="edit-user-role"
                          className="mb-1.5 block text-sm font-medium text-foreground"
                        >
                          Role
                        </label>
                        <select
                          id="edit-user-role"
                          value={formData.role}
                          disabled={isOwnAccount}
                          aria-describedby={
                            isOwnAccount ? "own-role-note" : undefined
                          }
                          onChange={(event) =>
                            setFormData({
                              ...formData,
                              role: event.target.value as Role,
                            })
                          }
                          className={inputClassName}
                        >
                          <option value="enforcer">Traffic Enforcer</option>
                          <option value="pnp">PNP / Police</option>
                          <option value="treasury">Municipal Treasury</option>
                          <option value="admin">System Admin</option>
                          <option value="violator">Public / Violator</option>
                        </select>
                        {isOwnAccount && (
                          <p
                            id="own-role-note"
                            className="mt-1.5 text-xs text-muted-foreground"
                          >
                            You cannot change your own administrator role.
                          </p>
                        )}
                      </div>
                      <div>
                        <label
                          htmlFor="edit-user-unit"
                          className="mb-1.5 block text-sm font-medium text-foreground"
                        >
                          Assigned unit
                        </label>
                        <input
                          id="edit-user-unit"
                          required
                          maxLength={200}
                          value={formData.unit}
                          onChange={(event) =>
                            setFormData({
                              ...formData,
                              unit: event.target.value,
                            })
                          }
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </fieldset>
                  <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setFormData(userForm(account));
                        setIsEditing(false);
                        setError("");
                      }}
                      className={secondaryButtonClassName}
                    >
                      Cancel edit
                    </button>
                    <button
                      type="submit"
                      disabled={isBusy}
                      className={primaryButtonClassName}
                    >
                      {action === "save" && (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      )}
                      {action === "save" ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Full name</dt>
                    <dd className="mt-1 break-words font-medium text-foreground">
                      {account.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Email / badge no.</dt>
                    <dd className="mt-1 break-words text-foreground">
                      {account.credential}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Role</dt>
                    <dd className="mt-1 uppercase text-foreground">
                      {account.role}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Assigned unit</dt>
                    <dd className="mt-1 break-words text-foreground">
                      {account.unit || "Not assigned"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Email status</dt>
                    <dd className="mt-1 text-foreground">{emailStatus}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Account ID</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-foreground">
                      {account.id}
                    </dd>
                  </div>
                </dl>
              )}
            </section>

            <section
              aria-labelledby="user-password-heading"
              className="border-t border-border pt-5"
            >
              <h2
                id="user-password-heading"
                className="font-semibold text-foreground"
              >
                Password
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {verificationPending
                  ? "This user must verify their email and set their first password using the invitation link."
                  : "Set a new password with at least 8 characters. Existing passwords are never displayed."}
              </p>
              {!isPasswordFormOpen ? (
                <button
                  type="button"
                  disabled={isBusy || !!verificationPending}
                  onClick={() => {
                    setError("");
                    setSuccess("");
                    setIsPasswordFormOpen(true);
                  }}
                  className={`${secondaryButtonClassName} mt-4`}
                >
                  <KeyRound aria-hidden="true" className="size-4" />
                  Update password
                </button>
              ) : (
                <form onSubmit={handlePasswordUpdate} className="mt-4">
                  <fieldset
                    disabled={isBusy}
                    className="grid gap-4 sm:grid-cols-2"
                  >
                    <div>
                      <label
                        htmlFor="user-new-password"
                        className="mb-1.5 block text-sm font-medium text-foreground"
                      >
                        New password
                      </label>
                      <input
                        id="user-new-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={128}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className={inputClassName}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="user-confirm-password"
                        className="mb-1.5 block text-sm font-medium text-foreground"
                      >
                        Confirm new password
                      </label>
                      <input
                        id="user-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={128}
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        className={inputClassName}
                      />
                    </div>
                  </fieldset>
                  <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setPassword("");
                        setConfirmPassword("");
                        setIsPasswordFormOpen(false);
                        setError("");
                      }}
                      className={secondaryButtonClassName}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isBusy}
                      className={primaryButtonClassName}
                    >
                      {action === "password" && (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      )}
                      {action === "password" ? "Updating…" : "Update password"}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section
              aria-labelledby="user-delete-heading"
              className="border-t border-border pt-5"
            >
              <h2
                id="user-delete-heading"
                className="font-semibold text-foreground"
              >
                Delete account
              </h2>
              <p
                id="delete-user-note"
                className="mt-1 text-sm text-muted-foreground"
              >
                {isOwnAccount
                  ? "You cannot delete the administrator account you are currently using."
                  : "Removes account access. Citation and payment history will be retained."}
              </p>
              <AlertDialog.Root
                open={deleteOpen}
                onOpenChange={(open) => {
                  if (busyRef.current) return;
                  setDeleteOpen(open);
                  if (open) {
                    setDeleteError("");
                    setDeleteConfirmText("");
                  }
                }}
              >
                <AlertDialog.Trigger asChild>
                  <button
                    type="button"
                    disabled={isBusy || isOwnAccount}
                    aria-describedby="delete-user-note"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Delete user
                  </button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm" />
                  <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%_-_2rem)] max-w-md max-h-[calc(100dvh_-_2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-popover p-6 shadow-xl">
                    <AlertDialog.Title className="text-lg font-semibold text-foreground">
                      Delete {account.name}?
                    </AlertDialog.Title>
                    <AlertDialog.Description className="mt-3 break-words text-sm text-muted-foreground">
                      This will remove access for {account.credential}. Citation
                      and payment history will be retained. This account
                      deletion cannot be undone.
                    </AlertDialog.Description>
                    <div className="mt-4 space-y-1.5">
                      <label
                        htmlFor="delete-user-confirm-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        To confirm deletion, type{" "}
                        <span className="font-mono font-bold text-destructive">
                          delete this user
                        </span>{" "}
                        below:
                      </label>
                      <input
                        id="delete-user-confirm-input"
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="delete this user"
                        disabled={isBusy}
                        autoComplete="off"
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-destructive focus:ring-2 focus:ring-destructive/20"
                      />
                    </div>
                    {deleteError && (
                      <p
                        role="alert"
                        className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      >
                        {deleteError}
                      </p>
                    )}
                    <div className="mt-6 flex flex-wrap justify-end gap-3">
                      <AlertDialog.Cancel asChild>
                        <button
                          type="button"
                          disabled={isBusy}
                          className={secondaryButtonClassName}
                        >
                          Keep user
                        </button>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action asChild>
                        <button
                          type="button"
                          disabled={
                            isBusy ||
                            deleteConfirmText.trim().toLowerCase() !==
                              "delete this user"
                          }
                          onClick={(event) => {
                            event.preventDefault();
                            if (
                              deleteConfirmText.trim().toLowerCase() !==
                              "delete this user"
                            ) {
                              return;
                            }
                            void handleDelete();
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50"
                        >
                          {action === "delete" && (
                            <Loader2
                              aria-hidden="true"
                              className="size-4 animate-spin"
                            />
                          )}
                          {action === "delete" ? "Deleting…" : "Delete user"}
                        </button>
                      </AlertDialog.Action>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
