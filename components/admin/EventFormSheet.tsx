import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import api from "@/service/api.service";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import { Button, ButtonRow, ChoiceList, Field, Loading, Sheet } from "@/components/admin/ui";
import { GroupLabel, PickRow, Segmented, isYmd, ymd } from "@/components/admin/formBits";

export interface AdminEvent {
  id: number;
  name: string | null;
  shortName: string | null;
  description: string | null;
  eventDate: string | null;
  endDate: string | null;
  isOpen: number | null;
  isPrivate: boolean;
  eventTypeId: number | null;
  eventType?: { id: number; name: string | null } | null;
  createdBy?: { name?: string | null } | null;
  latitude: number | null;
  longitude: number | null;
  locationAddress: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactWebsite: string | null;
  contactAddress: string | null;
  socialYt: string | null;
  socialFb: string | null;
  socialTwitter: string | null;
  socialInsta: string | null;
  logoImage: string | null;
  bannerImage: string | null;
}

interface Picked {
  uri: string;
  name: string;
  type: string;
  /** Only on web, where the picker hands back a real File. */
  file?: unknown;
}

/** The fields the create route drops, so they follow in an update. */
const AFTER_CREATE = [
  "locationAddress",
  "contactName",
  "contactEmail",
  "contactPhone",
  "contactWebsite",
  "contactAddress",
  "socialYt",
  "socialFb",
  "socialTwitter",
  "socialInsta",
] as const;

const BLANK = {
  name: "",
  shortName: "",
  description: "",
  eventDate: "",
  endDate: "",
  isOpen: 1,
  isPrivate: false,
  eventTypeId: null as number | null,
  latitude: "",
  longitude: "",
  locationAddress: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  contactWebsite: "",
  contactAddress: "",
  socialYt: "",
  socialFb: "",
  socialTwitter: "",
  socialInsta: "",
};

type Form = typeof BLANK;

/**
 * Everything an event is, in one form — used to make one and to change one.
 *
 * The event routes are the only ones in this section that read multipart
 * rather than JSON, because the logo and banner travel with the fields. That is
 * why this sheet talks to the server itself instead of going through
 * `useAdminAction`: the shared hook sends JSON, and JSON to these two routes is
 * a 500. The failure handling below is the hook's, restated.
 *
 * Three things about how the routes read the form are easy to get wrong, and
 * each one changes what gets saved:
 *
 * - Visibility is read with a truthiness coercion, so the *string* "false" is
 *   true. Public is sent as an empty value, which is the only thing that reads
 *   as false.
 * - A blank date, type or coordinate is not "clear this" — blank coerces to
 *   zero or is skipped. So those are left out when empty rather than sent.
 * - Creating keeps only the core fields. Address, contact and social links are
 *   accepted by the update route alone, so a new event is created and then
 *   updated with them in a second call.
 */
export function EventFormSheet({
  open,
  event,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null to create. */
  event: AdminEvent | null;
  onClose: () => void;
  onSaved: (saved: AdminEvent, created: boolean) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(BLANK);
  const [logo, setLogo] = useState<Picked | null>(null);
  const [banner, setBanner] = useState<Picked | null>(null);
  const [pickingType, setPickingType] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const types = useAdminData<{ eventTypes?: { id: number; name: string | null }[] }>(
    open ? "/admin/event-type" : null,
    [open]
  );
  const eventTypes = types.data?.eventTypes ?? [];

  useEffect(() => {
    if (!open) return;
    setLogo(null);
    setBanner(null);
    setPickingType(false);
    setForm(
      event
        ? {
            name: event.name ?? "",
            shortName: event.shortName ?? "",
            description: event.description ?? "",
            eventDate: ymd(event.eventDate),
            endDate: ymd(event.endDate),
            isOpen: event.isOpen ?? 1,
            isPrivate: event.isPrivate ?? false,
            eventTypeId: event.eventTypeId ?? null,
            latitude: event.latitude != null ? String(event.latitude) : "",
            longitude: event.longitude != null ? String(event.longitude) : "",
            locationAddress: event.locationAddress ?? "",
            contactName: event.contactName ?? "",
            contactEmail: event.contactEmail ?? "",
            contactPhone: event.contactPhone ?? "",
            contactWebsite: event.contactWebsite ?? "",
            contactAddress: event.contactAddress ?? "",
            socialYt: event.socialYt ?? "",
            socialFb: event.socialFb ?? "",
            socialTwitter: event.socialTwitter ?? "",
            socialInsta: event.socialInsta ?? "",
          }
        : BLANK
    );
  }, [open, event]);

  const set = (patch: Partial<Form>) => setForm((prev) => ({ ...prev, ...patch }));

  const pickImage = async (kind: "logo" | "banner") => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        // The phone's own crop step stands in for the portal's cropper.
        allowsEditing: true,
        aspect: kind === "logo" ? [1, 1] : [16, 9],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const picked: Picked = {
        uri: a.uri,
        name: a.fileName ?? `${kind}.jpg`,
        type: a.mimeType ?? "image/jpeg",
        file: a.file,
      };
      if (kind === "logo") setLogo(picked);
      else setBanner(picked);
    } catch {
      toast.error("That picture could not be opened.");
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const asked = await Location.requestForegroundPermissionsAsync();
      if (asked.status !== "granted") {
        toast.error("Location is switched off for this app.");
        return;
      }
      const here = await Location.getCurrentPositionAsync({});
      set({
        latitude: here.coords.latitude.toFixed(6),
        longitude: here.coords.longitude.toFixed(6),
      });
    } catch {
      toast.error("Could not get a position just now.");
    } finally {
      setLocating(false);
    }
  };

  const send = (method: "post" | "put", body: FormData, withFiles: boolean) =>
    api[method]("/admin/event", body, {
      // Unset so the runtime writes its own multipart boundary.
      headers: { "Content-Type": undefined as unknown as string },
      transformRequest: (value) => value,
      // A banner over a slow connection outlasts the usual budget.
      ...(withFiles ? { timeout: 60000 } : {}),
    });

  const attach = (body: FormData, key: string, picked: Picked | null) => {
    if (!picked) return;
    body.append(
      key,
      (picked.file ?? { uri: picked.uri, name: picked.name, type: picked.type }) as unknown as Blob
    );
  };

  const submit = async () => {
    if (inFlight.current) return;

    const name = form.name.trim();
    const eventDate = form.eventDate.trim();
    const endDate = form.endDate.trim();
    const lat = form.latitude.trim();
    const lng = form.longitude.trim();

    if (!name) return toast.error("Give the event a name.");
    if (form.eventTypeId == null) return toast.error("Pick the event type.");
    if (!isYmd(eventDate)) return toast.error("The start date has to be written YYYY-MM-DD.");
    if (endDate && !isYmd(endDate)) return toast.error("The end date has to be written YYYY-MM-DD.");
    if (endDate && endDate < eventDate) return toast.error("The event cannot end before it starts.");
    if ((lat === "") !== (lng === "")) return toast.error("A coordinate needs both halves.");
    if (lat !== "") {
      const la = parseFloat(lat);
      const lo = parseFloat(lng);
      if (isNaN(la) || isNaN(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
        return toast.error("Those coordinates are not on the map.");
      }
    }

    const core = new FormData();
    core.append("name", name);
    core.append("isOpen", String(form.isOpen));
    // Empty, not "false": the route coerces by truthiness and "false" is true.
    core.append("isPrivate", form.isPrivate ? "true" : "");
    core.append("eventTypeId", String(form.eventTypeId));
    core.append("eventDate", eventDate);
    if (endDate) core.append("endDate", endDate);
    if (lat !== "") {
      core.append("latitude", lat);
      core.append("longitude", lng);
    }
    attach(core, "logoImage", logo);
    attach(core, "bannerImage", banner);

    inFlight.current = true;
    setPending(true);
    try {
      const withFiles = logo != null || banner != null;

      if (event) {
        // Sent even when blank — on an update, blank is how a field is cleared.
        core.append("eventId", String(event.id));
        core.append("shortName", form.shortName.trim());
        core.append("description", form.description.trim());
        for (const key of AFTER_CREATE) core.append(key, form[key].trim());
        const res = await send("put", core, withFiles);
        toast.success("Event updated.");
        onSaved(res.data?.event as AdminEvent, false);
        return;
      }

      if (form.shortName.trim()) core.append("shortName", form.shortName.trim());
      if (form.description.trim()) core.append("description", form.description.trim());
      const created = await send("post", core, withFiles);
      let saved = created.data?.event as AdminEvent;

      const extras = AFTER_CREATE.filter((key) => form[key].trim() !== "");
      if (saved?.id != null && extras.length > 0) {
        const rest = new FormData();
        rest.append("eventId", String(saved.id));
        for (const key of extras) rest.append(key, form[key].trim());
        try {
          const res = await send("put", rest, false);
          saved = (res.data?.event as AdminEvent) ?? saved;
        } catch {
          // The event exists; saying it failed would invite a duplicate.
          toast.error("Event created, but its address and contact details were not saved.");
          onSaved(saved, true);
          return;
        }
      }
      toast.success("Event created.");
      onSaved(saved, true);
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      const said = data?.errors?.[0]?.message ?? data?.message;
      if (said) toast.error(said);
      else if (status === 401 || status === 403) toast.error("That is not part of your access.");
      else if (err?.code === "ECONNABORTED") toast.error("The server took too long. Nothing was changed.");
      else toast.error("That did not go through.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const typeName = eventTypes.find((t) => t.id === form.eventTypeId)?.name ?? null;
  const logoShown = logo?.uri ?? event?.logoImage ?? null;
  const bannerShown = banner?.uri ?? event?.bannerImage ?? null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={pickingType ? "Event type" : event ? "Edit event" : "New event"}
      subtitle={
        pickingType ? undefined : event ? event.name : "Its first season is opened straight after"
      }
    >
      {pickingType ? (
        <>
          {types.loading ? (
            <Loading />
          ) : (
            <ChoiceList
              choices={eventTypes.map((t) => ({ key: t.id, label: t.name ?? `Type ${t.id}` }))}
              selected={form.eventTypeId}
              onPick={(key) => {
                set({ eventTypeId: Number(key) });
                setPickingType(false);
              }}
              empty="No event types are set up yet."
            />
          )}
          <ButtonRow>
            <Button label="Back" tone="secondary" onPress={() => setPickingType(false)} full />
          </ButtonRow>
        </>
      ) : (
        <>
          <Field label="Name" value={form.name} onChange={(v) => set({ name: v })} />
          <Field
            label="Short name"
            value={form.shortName}
            onChange={(v) => set({ shortName: v })}
            hint="What it is called on a narrow screen."
          />
          <Field
            label="Description"
            value={form.description}
            onChange={(v) => set({ description: v })}
            multiline
          />
          <PickRow
            label="Event type"
            value={typeName ?? (form.eventTypeId != null ? `Type ${form.eventTypeId}` : null)}
            placeholder="Choose a type"
            onPress={() => setPickingType(true)}
          />
          <Field
            label="Starts"
            value={form.eventDate}
            onChange={(v) => set({ eventDate: v })}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Ends"
            value={form.endDate}
            onChange={(v) => set({ endDate: v })}
            placeholder="YYYY-MM-DD"
          />
          <Segmented
            label="Status"
            options={[
              { key: 1, label: "Open" },
              { key: 0, label: "Closed" },
            ]}
            value={form.isOpen === 1 ? 1 : 0}
            onChange={(v) => set({ isOpen: v })}
          />
          <Segmented
            label="Visibility"
            options={[
              { key: "public", label: "Public" },
              { key: "private", label: "Private" },
            ]}
            value={form.isPrivate ? "private" : "public"}
            onChange={(v) => set({ isPrivate: v === "private" })}
            hint="A private event and its races are hidden from breeders who are not registered in one of its seasons. Admins always see it."
          />

          <GroupLabel>Location</GroupLabel>
          <Field
            label="Address"
            value={form.locationAddress}
            onChange={(v) => set({ locationAddress: v })}
            placeholder="123 Main St, Springfield, IL 62701"
            hint="What breeders read. The pin below is what the map uses."
          />
          <Field
            label="Latitude"
            value={form.latitude}
            onChange={(v) => set({ latitude: v })}
            keyboard="decimal-pad"
            placeholder="26.7056"
          />
          <Field
            label="Longitude"
            value={form.longitude}
            onChange={(v) => set({ longitude: v })}
            keyboard="decimal-pad"
            placeholder="-80.0364"
          />
          <ButtonRow>
            <Button
              label="Use where I am standing"
              tone="secondary"
              icon="locate-outline"
              onPress={useMyLocation}
              pending={locating}
              full
            />
          </ButtonRow>

          <GroupLabel>Pictures</GroupLabel>
          <View className="flex-row items-center gap-3">
            {logoShown ? (
              <Image
                source={{ uri: logoShown }}
                style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: "#f1f5f9" }}
                contentFit="cover"
              />
            ) : (
              <View className="h-14 w-14 rounded-lg bg-slate-100" />
            )}
            <View className="flex-1">
              <Text className="text-sm font-medium text-slate-900">Logo</Text>
              <Text className="text-xs text-slate-500">
                {logo ? "Chosen — saved with the event" : "Square"}
              </Text>
            </View>
            <Button
              label={logoShown ? "Replace" : "Choose"}
              tone="secondary"
              onPress={() => pickImage("logo")}
            />
          </View>
          <View className="mt-3">
            {bannerShown ? (
              <Image
                source={{ uri: bannerShown }}
                style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: "#f1f5f9" }}
                contentFit="cover"
              />
            ) : null}
            <View className="mt-2 flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-900">Banner</Text>
                <Text className="text-xs text-slate-500">
                  {banner ? "Chosen — saved with the event" : "Wide, 16:9"}
                </Text>
              </View>
              <Button
                label={bannerShown ? "Replace" : "Choose"}
                tone="secondary"
                onPress={() => pickImage("banner")}
              />
            </View>
          </View>

          <GroupLabel>Contact</GroupLabel>
          <Field label="Name" value={form.contactName} onChange={(v) => set({ contactName: v })} />
          <Field
            label="Email"
            value={form.contactEmail}
            onChange={(v) => set({ contactEmail: v })}
            keyboard="email-address"
          />
          <Field label="Phone" value={form.contactPhone} onChange={(v) => set({ contactPhone: v })} />
          <Field
            label="Website"
            value={form.contactWebsite}
            onChange={(v) => set({ contactWebsite: v })}
            placeholder="https://example.com"
          />
          <Field
            label="Address"
            value={form.contactAddress}
            onChange={(v) => set({ contactAddress: v })}
          />

          <GroupLabel>Social</GroupLabel>
          <Field
            label="YouTube"
            value={form.socialYt}
            onChange={(v) => set({ socialYt: v })}
            placeholder="https://youtube.com/..."
          />
          <Field
            label="Facebook"
            value={form.socialFb}
            onChange={(v) => set({ socialFb: v })}
            placeholder="https://facebook.com/..."
          />
          <Field
            label="Twitter"
            value={form.socialTwitter}
            onChange={(v) => set({ socialTwitter: v })}
            placeholder="https://twitter.com/..."
          />
          <Field
            label="Instagram"
            value={form.socialInsta}
            onChange={(v) => set({ socialInsta: v })}
            placeholder="https://instagram.com/..."
          />

          <ButtonRow>
            <Button label="Cancel" tone="secondary" onPress={onClose} disabled={pending} full />
            <Button label={event ? "Save" : "Create"} onPress={submit} pending={pending} full />
          </ButtonRow>
        </>
      )}
    </Sheet>
  );
}
