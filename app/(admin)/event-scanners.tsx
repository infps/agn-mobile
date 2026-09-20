import React, { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Confirm,
  Empty,
  Field,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  Sheet,
} from "@/components/admin/ui";

interface Mapping {
  id: number;
  scannerSerial: string;
  eventGroupId: number | null;
  label: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  scanCount: number;
  eventGroup?: { id: number; name: string | null; type: string | null } | null;
}

interface Group {
  id: number;
  name: string | null;
}

interface Unmapped {
  scannerSerial: string;
  scanCount: number;
  lastSeenAt: string | null;
}

/** "3 minutes ago" beats a timestamp when the question is "is it alive". */
function since(iso: string | null): string {
  if (!iso) return "never heard from";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * Which reader feeds which loft section.
 *
 * A reader pushes a tag with nothing but its own serial attached. Mapping that
 * serial to a section is what turns a bare read into "this bird is now in
 * Section B" — without it every scan lands unfiled and somebody sorts it out
 * later by hand.
 *
 * Readers heard from in the last week but not mapped are listed separately,
 * because that list is the answer to the two questions actually asked at an
 * event: which reader is this, and why are its scans not going anywhere. The
 * last-seen time is there for the same reason — a mapped reader that has gone
 * quiet looks identical to a working one until you check.
 */
export default function EventScanners() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const base = eventId ? `/admin/event/${eventId}/scanner-mappings` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    mappings?: Mapping[];
    groups?: Group[];
    unmappedSerials?: Unmapped[];
  }>(base, [eventId]);

  const [mapping, setMapping] = useState<{ serial: string; existing: Mapping | null } | null>(null);
  const [label, setLabel] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [serial, setSerial] = useState("");
  const [removing, setRemoving] = useState<Mapping | null>(null);

  const mappings = data?.mappings ?? [];
  const groups = data?.groups ?? [];
  const unmapped = data?.unmappedSerials ?? [];
  const mayManage = can("scanners.manage");

  if (forbidden) return <NoAccess what="Scanners" />;

  const groupChoices: Choice[] = [
    { key: 0, label: "No section", hint: "Scans are recorded but not filed anywhere" },
    ...groups.map((g) => ({ key: g.id, label: g.name ?? `Section ${g.id}` })),
  ];

  const openMapper = (serialValue: string, existing: Mapping | null) => {
    setLabel(existing?.label ?? "");
    setGroupId(existing?.eventGroupId ?? null);
    setMapping({ serial: serialValue, existing });
  };

  const save = async () => {
    if (!mapping) return;
    const { ok } = await action.run(
      "post",
      base!,
      {
        scannerSerial: mapping.serial,
        // Zero is the sentinel the picker uses for "no section"; the server
        // wants a null, not a group that does not exist.
        eventGroupId: groupId === 0 ? null : groupId,
        label: label.trim() || null,
      },
      { success: "Reader mapped." }
    );
    if (ok) {
      setMapping(null);
      reload();
    }
  };

  const addManual = () => {
    const trimmed = serial.trim();
    if (!trimmed) {
      toast.error("Enter the reader's serial.");
      return;
    }
    setAdding(false);
    setSerial("");
    openMapper(trimmed, null);
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}?id=${removing.id}`, undefined, {
      success: "Mapping removed.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  // "Heard from in the last hour" needs the current time, and there is no way
  // to ask that question purely. It is read once per render rather than per
  // row so every reader on screen is judged against the same instant — two
  // readers a millisecond apart on the hour boundary reading differently is
  // the kind of thing that gets blamed on the hardware.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const live = mappings.filter(
    (m) => m.lastSeenAt && now - new Date(m.lastSeenAt).getTime() < 60 * 60 * 1000
  ).length;

  return (
    <Screen
      title="Scanners"
      subtitle={name ? `${name} · ${mappings.length} mapped` : `${mappings.length} mapped`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        mayManage ? (
          <ButtonRow>
            <Button
              label="Map a serial by hand"
              icon="add"
              tone="secondary"
              onPress={() => {
                setSerial("");
                setAdding(true);
              }}
            />
          </ButtonRow>
        ) : null
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Mapped" value={mappings.length} basis="31%" />
            <Figure
              label="Heard from"
              value={live}
              tone={live > 0 ? "text-emerald-600" : "text-slate-400"}
              basis="31%"
            />
            <Figure
              label="Unmapped"
              value={unmapped.length}
              tone={unmapped.length > 0 ? "text-amber-600" : "text-slate-900"}
              basis="31%"
            />
          </FigureRow>

          {unmapped.length > 0 ? (
            <>
              <Notice>
                {unmapped.length} reader{unmapped.length === 1 ? " is" : "s are"} pushing scans that
                are not being filed into any section.
              </Notice>
              <Text className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Heard from, not mapped
              </Text>
              <Rows>
                {unmapped.map((u) => (
                  <Row
                    key={u.scannerSerial}
                    title={u.scannerSerial}
                    subtitle={`${u.scanCount} scans · ${since(u.lastSeenAt)}`}
                    right={mayManage ? "Map" : undefined}
                    rightTone="text-cyan-600"
                    onPress={mayManage ? () => openMapper(u.scannerSerial, null) : undefined}
                  />
                ))}
              </Rows>
            </>
          ) : null}

          <Text className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Mapped readers
          </Text>
          {mappings.length === 0 ? (
            <Empty>No reader has been mapped to a section for this season.</Empty>
          ) : (
            <Rows>
              {mappings.map((m) => (
                <Row
                  key={m.id}
                  title={m.label || m.scannerSerial}
                  subtitle={`${m.eventGroup?.name ?? "No section"} · ${since(m.lastSeenAt)}`}
                  right={`${m.scanCount}`}
                  rightSub="scans"
                  rightTone={m.isActive ? "text-slate-600" : "text-slate-400"}
                  badge={
                    m.eventGroupId == null
                      ? { label: "unfiled", bg: "bg-amber-100", text: "text-amber-700" }
                      : null
                  }
                  onPress={mayManage ? () => openMapper(m.scannerSerial, m) : undefined}
                />
              ))}
            </Rows>
          )}
        </>
      )}

      <Sheet
        open={mapping != null}
        onClose={() => setMapping(null)}
        title={mapping?.serial ?? "Map a reader"}
        subtitle="Scans from this reader file into the section you pick"
      >
        <Field
          label="Name"
          value={label}
          onChange={setLabel}
          placeholder="Loft door reader"
          hint="What to call it on this screen. The serial is what identifies it."
        />
        <Text className="mb-1 mt-3 text-xs font-medium text-slate-600">Section</Text>
        <ChoiceList
          choices={groupChoices}
          selected={groupId ?? 0}
          onPick={(k) => setGroupId(Number(k))}
          empty="This season has no loft sections yet."
        />
        <ButtonRow>
          {mapping?.existing ? (
            <Button
              label="Unmap"
              tone="secondary"
              onPress={() => {
                const ex = mapping.existing;
                setMapping(null);
                if (ex) setRemoving(ex);
              }}
              full
            />
          ) : (
            <Button label="Cancel" tone="secondary" onPress={() => setMapping(null)} full />
          )}
          <Button label="Save" onPress={save} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Map a serial by hand">
        <Field
          label="Scanner serial"
          value={serial}
          onChange={setSerial}
          placeholder="As printed on the reader"
          autoFocus
          hint="Use this when a reader has not pushed a scan yet, so it is not in the list."
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setAdding(false)} full />
          <Button label="Next" onPress={addManual} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Unmap ${removing?.label || removing?.scannerSerial || "this reader"}?`}
        body="Its scans keep being recorded, but they stop being filed into a section automatically."
        confirmLabel="Unmap"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
