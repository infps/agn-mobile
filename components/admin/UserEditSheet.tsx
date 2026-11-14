import React, { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import { Chips } from "@/components/admin/Chips";
import { Button, ButtonRow, Field, Sheet } from "@/components/admin/ui";

/** An account as `/admin/users` returns it. */
export interface EditableUser {
  id: string;
  name: string | null;
  lastName: string | null;
  email: string | null;
  username?: string | null;
  displayUsername?: string | null;
  role: string | null;
  status?: string | null;
  city: string | null;
  state: string | null;
  phoneNumber?: string | null;
  loftName?: string | null;
  address?: string | null;
  country?: string | null;
  postalCode?: string | null;
  webAddress?: string | null;
  ssn?: string | null;
  taxNumber?: string | null;
  timezone?: string | null;
  legalName?: string | null;
  note?: string | null;
  image?: string | null;
  imageKey?: string | null;
  ssnDocKey?: string | null;
  taxDocKey?: string | null;
  // These live on the linked breeder record; the server folds them in.
  phoneNumber2?: string | null;
  address2?: string | null;
  city2?: string | null;
  state2?: string | null;
  zip2?: string | null;
  defaultTeamName?: string | null;
}

const BLANK = {
  name: "",
  lastName: "",
  email: "",
  password: "",
  username: "",
  displayUsername: "",
  role: "BREEDER",
  status: "ACTIVE",
  country: "",
  state: "",
  city: "",
  address: "",
  postalCode: "",
  address2: "",
  city2: "",
  state2: "",
  zip2: "",
  phoneNumber: "",
  phoneNumber2: "",
  defaultTeamName: "",
  webAddress: "",
  ssn: "",
  taxNumber: "",
  loftName: "",
  note: "",
  timezone: "",
  legalName: "",
};

type Form = typeof BLANK;

/** Everything except the two fields the server never accepts on an edit. */
const EDITABLE: (keyof Form)[] = (Object.keys(BLANK) as (keyof Form)[]).filter(
  (k) => k !== "email" && k !== "password"
);

interface Picked {
  uri: string;
  name: string;
  type: string;
}

const ROLES = [
  { key: "BREEDER", label: "Breeder" },
  { key: "BETTOR", label: "Bettor" },
  { key: "ADMIN", label: "Admin" },
  { key: "SUPERADMIN", label: "Super admin" },
];

const STATUSES = [
  { key: "ACTIVE", label: "Active" },
  { key: "INACTIVE", label: "Inactive" },
  { key: "PROSPECT", label: "Prospect" },
];

function fromUser(u: EditableUser): Form {
  return {
    ...BLANK,
    name: u.name ?? "",
    lastName: u.lastName ?? "",
    email: u.email ?? "",
    username: u.username ?? "",
    displayUsername: u.displayUsername ?? "",
    role: u.role ?? "BREEDER",
    status: u.status ?? "ACTIVE",
    country: u.country ?? "",
    state: u.state ?? "",
    city: u.city ?? "",
    address: u.address ?? "",
    postalCode: u.postalCode ?? "",
    address2: u.address2 ?? "",
    city2: u.city2 ?? "",
    state2: u.state2 ?? "",
    zip2: u.zip2 ?? "",
    phoneNumber: u.phoneNumber ?? "",
    phoneNumber2: u.phoneNumber2 ?? "",
    defaultTeamName: u.defaultTeamName ?? "",
    webAddress: u.webAddress ?? "",
    ssn: u.ssn ?? "",
    taxNumber: u.taxNumber ?? "",
    loftName: u.loftName ?? "",
    note: u.note ?? "",
    timezone: u.timezone ?? "",
    legalName: u.legalName ?? "",
  };
}

/**
 * A copy starts from somebody else's details but is a different person: the
 * portal blanks everything that identifies an individual — email, username,
 * SSN, tax number, legal name — and so does this.
 */
function fromCopy(u: EditableUser): Form {
  return { ...fromUser(u), email: "", username: "", ssn: "", taxNumber: "", legalName: "" };
}

function mimeOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  return "image/jpeg";
}

/**
 * Send one file to the portal's bucket and get back where it landed.
 *
 * The same endpoint takes the profile picture and both identity documents; it
 * deletes `oldKey` first so replacing a file does not leave the last one behind.
 */
async function upload(file: Picked, oldKey?: string | null): Promise<{ url: string; key: string }> {
  const form = new FormData();
  form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  if (oldKey) form.append("oldKey", oldKey);
  const { data } = await api.post("/admin/users/upload-image", form, {
    // Unset so the runtime writes its own multipart boundary.
    headers: { "Content-Type": undefined as unknown as string },
    transformRequest: (value) => value,
  });
  return data;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </Text>
  );
}

/**
 * Adding a breeder, or correcting one.
 *
 * A breeder in this system is an account, not a separate record — the portal's
 * "add breeder" dialog writes to the same `/admin/users` endpoint this does, so
 * the two stay in step without anything being kept in sync.
 *
 * Creating one needs a password because the account has to be able to sign in;
 * editing one never touches it or the email, which is why both fields go
 * read-only. The server would ignore them anyway.
 *
 * An edit sends only what changed. Sending the whole form back would overwrite
 * whatever somebody saved from the web side between this sheet opening and the
 * save — and a field cleared here still goes as an empty string, because
 * clearing a wrong phone number has to be possible.
 *
 * The order is the order it gets filled in: who they are, how to reach them,
 * where they are, and last the tax paperwork that only matters at payout.
 */
export function UserEditSheet({
  open,
  editing,
  copyFrom = null,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null means a new account. */
  editing: EditableUser | null;
  /** A new account pre-filled from this one. Ignored while editing. */
  copyFrom?: EditableUser | null;
  onClose: () => void;
  /** Handed the email of a newly created account, so a caller can find it again. */
  onSaved: (created?: { email: string }) => void;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const [form, setForm] = useState<Form>(BLANK);
  const [original, setOriginal] = useState<Form>(BLANK);
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [ssnDoc, setSsnDoc] = useState<Picked | null>(null);
  const [taxDoc, setTaxDoc] = useState<Picked | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start = editing ? fromUser(editing) : copyFrom ? fromCopy(copyFrom) : BLANK;
    setForm(start);
    setOriginal(start);
    setPhoto(null);
    setSsnDoc(null);
    setTaxDoc(null);
  }, [open, editing, copyFrom]);

  const set = (key: keyof Form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const pickPhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        // The portal crops profile pictures square; so does this.
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const name = asset.fileName ?? asset.uri.split("/").pop() ?? "profile.jpg";
      setPhoto({ uri: asset.uri, name, type: asset.mimeType ?? mimeOf(name) });
    } catch {
      toast.error("The photo library could not be opened.");
    }
  };

  const pickDoc = async (into: (file: Picked) => void) => {
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ["application/pdf", "image/*"] });
      if (picked.canceled || !picked.result) return;
      const uri = picked.result.uri;
      const name = uri.split("/").pop() || "document.pdf";
      into({ uri, name, type: mimeOf(name) });
    } catch (err: any) {
      // Backing out of a picker is the normal way to leave it.
      if (!/cancel/i.test(String(err?.message ?? ""))) {
        toast.error("That file could not be opened.");
      }
    }
  };

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
    const site = form.webAddress.trim();
    if (site && !/^https?:\/\/\S+$/i.test(site)) {
      toast.error("The website has to be a full address, starting with https://");
      return;
    }

    // Files go first: the account row only stores where they ended up.
    const files: Record<string, string> = {};
    if (photo || ssnDoc || taxDoc) {
      setUploading(true);
      try {
        if (photo) {
          const sent = await upload(photo, editing?.imageKey);
          files.image = sent.url;
          files.imageKey = sent.key;
        }
        if (ssnDoc) files.ssnDocKey = (await upload(ssnDoc, editing?.ssnDocKey)).key;
        if (taxDoc) files.taxDocKey = (await upload(taxDoc, editing?.taxDocKey)).key;
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? "A file did not upload. Nothing was saved.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    if (editing) {
      const changed: Record<string, string> = {};
      for (const key of EDITABLE) {
        const now = key === "role" || key === "status" ? form[key] : form[key].trim();
        if (now !== original[key]) changed[key] = now;
      }
      if (Object.keys(changed).length === 0 && Object.keys(files).length === 0) {
        onClose();
        return;
      }
      const { ok } = await action.run(
        "put",
        "/admin/users",
        { id: editing.id, ...changed, ...files },
        { success: "Account updated." }
      );
      if (ok) {
        onClose();
        onSaved();
      }
      return;
    }

    // On a new account blanks are left out: there is nothing to clear, and the
    // unique username column takes exactly one empty string before colliding.
    const filled: Record<string, string> = {};
    for (const key of EDITABLE) {
      const now = form[key].trim();
      if (now) filled[key] = now;
    }
    const email = form.email.trim();
    const { ok } = await action.run(
      "post",
      "/admin/users",
      { ...filled, ...files, email, password: form.password },
      { success: "Breeder added." }
    );
    if (ok) {
      onClose();
      onSaved({ email });
    }
  };

  const shownPhoto = photo?.uri ?? editing?.image ?? null;
  const busy = uploading || action.pending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit breeder" : copyFrom ? "Copy breeder" : "Add a breeder"}
      subtitle={
        editing
          ? "Their email and password are not changed here"
          : "They will be able to sign in straight away"
      }
    >
      <Pressable onPress={pickPhoto} className="mt-3 flex-row items-center gap-3">
        {shownPhoto ? (
          <Image source={{ uri: shownPhoto }} className="h-16 w-16 rounded-full bg-slate-100" />
        ) : (
          <View className="h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <Ionicons name="person-outline" size={26} color="#94a3b8" />
          </View>
        )}
        <View className="flex-1">
          <Text className="text-sm font-medium text-cyan-700">
            {shownPhoto ? "Change profile picture" : "Add a profile picture"}
          </Text>
          <Text className="text-xs text-slate-400">Cropped square, uploaded when you save.</Text>
        </View>
      </Pressable>

      <Field label="First name" value={form.name} onChange={set("name")} />
      <Field label="Last name" value={form.lastName} onChange={set("lastName")} />

      {editing ? (
        <View className="mt-3">
          <Text className="mb-1 text-xs font-medium text-slate-600">Email</Text>
          <Text className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
            {form.email || "none"}
          </Text>
        </View>
      ) : (
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
      <Field
        label="Display username"
        value={form.displayUsername}
        onChange={set("displayUsername")}
      />

      <Chips label="Role" options={ROLES} value={form.role} onChange={set("role")} />
      <Chips label="Status" options={STATUSES} value={form.status} onChange={set("status")} />

      <SectionLabel>Contact</SectionLabel>
      <Field label="Phone" value={form.phoneNumber} onChange={set("phoneNumber")} />
      <Field label="Second mobile" value={form.phoneNumber2} onChange={set("phoneNumber2")} />
      <Field
        label="Website"
        value={form.webAddress}
        onChange={set("webAddress")}
        placeholder="https://example.com"
      />

      <SectionLabel>Loft</SectionLabel>
      <Field
        label="Loft name"
        value={form.loftName}
        onChange={set("loftName")}
        placeholder="Smith Loft, AGN-42"
        hint="Printed on basket labels and race sheets."
      />
      <Field
        label="Default team name"
        value={form.defaultTeamName}
        onChange={set("defaultTeamName")}
        hint="Pre-fills the loft name when they register."
      />

      <SectionLabel>Address</SectionLabel>
      <Field label="Street" value={form.address} onChange={set("address")} />
      <Field label="City" value={form.city} onChange={set("city")} />
      <Field
        label="State"
        value={form.state}
        onChange={set("state")}
        hint="The portal stores the short code — FL, not Florida."
      />
      <Field label="Postal code" value={form.postalCode} onChange={set("postalCode")} />
      <Field
        label="Country"
        value={form.country}
        onChange={set("country")}
        hint="The portal stores the two-letter code — US, CA, GB."
      />

      <SectionLabel>Second address</SectionLabel>
      <Field label="Street" value={form.address2} onChange={set("address2")} />
      <Field label="City" value={form.city2} onChange={set("city2")} />
      <Field label="State" value={form.state2} onChange={set("state2")} />
      <Field label="Postal code" value={form.zip2} onChange={set("zip2")} />

      <SectionLabel>Tax</SectionLabel>
      <Field
        label="Legal name"
        value={form.legalName}
        onChange={set("legalName")}
        hint="As it should appear for tax purposes."
      />
      <Field label="SSN" value={form.ssn} onChange={set("ssn")} />
      <Field label="Tax number" value={form.taxNumber} onChange={set("taxNumber")} />
      <ButtonRow>
        <Button
          label={ssnDoc ? "SSN doc chosen" : editing?.ssnDocKey ? "Replace SSN doc" : "SSN document"}
          tone="secondary"
          icon={ssnDoc ? "checkmark" : "document-attach-outline"}
          onPress={() => pickDoc(setSsnDoc)}
          full
        />
        <Button
          label={taxDoc ? "Tax doc chosen" : editing?.taxDocKey ? "Replace tax doc" : "Tax document"}
          tone="secondary"
          icon={taxDoc ? "checkmark" : "document-attach-outline"}
          onPress={() => pickDoc(setTaxDoc)}
          full
        />
      </ButtonRow>
      {editing?.ssnDocKey || editing?.taxDocKey ? (
        <Text className="mt-1 text-xs text-slate-400">
          On file:{" "}
          {[editing?.ssnDocKey ? "SSN document" : null, editing?.taxDocKey ? "tax document" : null]
            .filter(Boolean)
            .join(", ")}
          .
        </Text>
      ) : null}

      <SectionLabel>Other</SectionLabel>
      <Field
        label="Timezone"
        value={form.timezone}
        onChange={set("timezone")}
        placeholder="America/New_York"
        hint="The region name, as the portal's list spells it."
      />
      <Field label="Note" value={form.note} onChange={set("note")} multiline />

      <ButtonRow>
        <Button label="Cancel" tone="secondary" onPress={onClose} disabled={busy} full />
        <Button label={editing ? "Save" : "Add"} onPress={save} pending={busy} full />
      </ButtonRow>
    </Sheet>
  );
}
