import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import { Button, ButtonRow, Field, Sheet } from "@/components/admin/ui";

export interface EditableUser {
  id: string;
  name: string | null;
  lastName: string | null;
  email: string | null;
  username?: string | null;
  role: string | null;
  city: string | null;
  state: string | null;
  phoneNumber?: string | null;
  loftName?: string | null;
  address?: string | null;
  country?: string | null;
  postalCode?: string | null;
  note?: string | null;
}

const BLANK = {
  name: "",
  lastName: "",
  email: "",
  username: "",
  password: "",
  phoneNumber: "",
  loftName: "",
  address: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
  note: "",
};

/**
 * Adding a breeder, or correcting one.
 *
 * A breeder in this system is an account, not a separate record — the portal's
 * "add breeder" dialog writes to the same `/admin/users` endpoint this does, so
 * the two stay in step without anything being kept in sync.
 *
 * Creating one needs a password because the account has to be able to sign in;
 * editing one never touches it, which is why the field disappears. An admin who
 * can silently overwrite somebody's password from a list screen is a problem
 * waiting to happen, and "leave blank to keep" is exactly the kind of rule that
 * gets misread at an event.
 *
 * The address block is the part filled in at a desk and the top block is the
 * part somebody reads off a form at a table, so the order is names, contact,
 * then everything else.
 */
export function UserEditSheet({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null means a new account. */
  editing: EditableUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            ...BLANK,
            name: editing.name ?? "",
            lastName: editing.lastName ?? "",
            email: editing.email ?? "",
            username: editing.username ?? "",
            phoneNumber: editing.phoneNumber ?? "",
            loftName: editing.loftName ?? "",
            address: editing.address ?? "",
            city: editing.city ?? "",
            state: editing.state ?? "",
            country: editing.country ?? "",
            postalCode: editing.postalCode ?? "",
            note: editing.note ?? "",
          }
        : BLANK
    );
  }, [open, editing]);

  const set = (key: keyof typeof BLANK) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("A first name is the least it needs.");
      return;
    }
    if (!editing) {
      if (!form.email.trim()) {
        toast.error("A new account needs an email to sign in with.");
        return;
      }
      if (form.password.length < 8) {
        toast.error("The password has to be at least 8 characters.");
        return;
      }
    }

    // Empty strings are dropped rather than sent: the portal treats "" on a
    // URL field as a validation failure, and sending blanks would wipe fields
    // somebody filled in from the web side.
    const optional = (value: string) => {
      const t = value.trim();
      return t ? t : undefined;
    };

    const shared = {
      name: form.name.trim(),
      lastName: optional(form.lastName),
      username: optional(form.username),
      phoneNumber: optional(form.phoneNumber),
      loftName: optional(form.loftName),
      address: optional(form.address),
      city: optional(form.city),
      state: optional(form.state),
      country: optional(form.country),
      postalCode: optional(form.postalCode),
      note: optional(form.note),
    };

    const { ok } = editing
      ? await action.run("put", "/admin/users", { id: editing.id, ...shared }, {
          success: "Account updated.",
        })
      : await action.run(
          "post",
          "/admin/users",
          {
            ...shared,
            email: form.email.trim(),
            password: form.password,
            role: "BREEDER",
            status: "ACTIVE",
          },
          { success: "Breeder added." }
        );

    if (ok) {
      onClose();
      onSaved();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit account" : "Add a breeder"}
      subtitle={
        editing
          ? "Their password and role are not changed here"
          : "They will be able to sign in straight away"
      }
    >
      <Field label="First name" value={form.name} onChange={set("name")} autoFocus />
      <Field label="Last name" value={form.lastName} onChange={set("lastName")} />

      {editing ? null : (
        <>
          <Field
            label="Email"
            value={form.email}
            onChange={set("email")}
            keyboard="email-address"
            hint="What they sign in with."
          />
          <Field
            label="Password"
            value={form.password}
            onChange={set("password")}
            hint="At least 8 characters. Tell them to change it."
          />
        </>
      )}

      <Field label="Username" value={form.username} onChange={set("username")} />
      <Field label="Phone" value={form.phoneNumber} onChange={set("phoneNumber")} />
      <Field label="Loft name" value={form.loftName} onChange={set("loftName")} />

      <Text className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Address
      </Text>
      <Field label="Street" value={form.address} onChange={set("address")} />
      <Field label="City" value={form.city} onChange={set("city")} />
      <Field label="State" value={form.state} onChange={set("state")} />
      <Field label="Postal code" value={form.postalCode} onChange={set("postalCode")} />
      <Field label="Country" value={form.country} onChange={set("country")} />
      <Field label="Note" value={form.note} onChange={set("note")} multiline />

      <ButtonRow>
        <Button label="Cancel" tone="secondary" onPress={onClose} full />
        <Button
          label={editing ? "Save" : "Add"}
          onPress={save}
          pending={action.pending}
          full
        />
      </ButtonRow>
    </Sheet>
  );
}
