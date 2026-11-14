import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";

import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
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
  Notice,
  Row,
  Rows,
  Sheet,
  money,
} from "@/components/admin/ui";
import {
  type AdminRaceItem,
  bandOf,
  breederOf,
  CheckRow,
  isUnpaid,
  itemStatus,
  Label,
  scanStamp,
  shortBand,
} from "@/components/admin/raceParts";

/**
 * The sheets that hang off one race.
 *
 * Each is one of the portal's race-page dialogs, kept together because none of
 * them means anything away from the race screen and every one takes the same
 * two things: a race id, and something to call when the race has changed.
 */

/* ------------------------------------------------------------------ */
/* Recalculate                                                         */
/* ------------------------------------------------------------------ */

interface RecalcChange {
  raceItemId: number;
  band: string | null;
  before: { position: number | null; hotspotPosition: number | null; prize: number | null };
  after: { position: number | null; hotspotPosition: number | null; prize: number | null };
}

interface RecalcSummary {
  raceTypeName: string | null;
  prizeRole: string;
  positionsAssigned: number;
  hotspotPositionsAssigned: number;
  prizesAwarded: number;
  prizeTotal: number;
  skippedUnpaid: number;
  skippedIgnored: number;
  warnings: string[];
  changes: RecalcChange[];
  changedCount: number;
}

const num = (n: number | null) => (n == null ? "—" : String(n));

/**
 * Rebuilding a race's result, preview first.
 *
 * Positions and prize money on a finished race are money, so nothing is written
 * on the way in: opening this runs the real calculation as a dry run and shows
 * exactly which birds would move. Only "Apply" writes, and it asks again with
 * the count in the sentence.
 */
export function RecalculateSheet({
  open,
  onClose,
  raceId,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
  onApplied: () => void;
}) {
  const toast = useToast();
  const preview = useAdminAction();
  const apply = useAdminAction();
  const [summary, setSummary] = useState<RecalcSummary | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSummary(null);
    setConfirming(false);
    preview
      .run<{ summary?: RecalcSummary }>("post", `/admin/race/${raceId}/recalculate?dryRun=1`)
      .then(({ ok, data }) => {
        if (ok && data?.summary) setSummary(data.summary);
        else if (!ok) onClose();
      });
    // Once per opening; the action object is stable enough not to be a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, raceId]);

  const commit = async () => {
    const { ok, data } = await apply.run<{ message?: string }>(
      "post",
      `/admin/race/${raceId}/recalculate`
    );
    setConfirming(false);
    if (ok) {
      toast.success(data?.message ?? "Results recalculated.");
      onClose();
      onApplied();
    }
  };

  return (
    <>
      <Sheet
        open={open && !confirming}
        onClose={onClose}
        title="Recalculate results"
        subtitle="Rebuilt from arrival times, payments and the excluded list. Nothing has been saved yet."
      >
        {!summary ? (
          <Loading />
        ) : (
          <>
            <FigureRow>
              <Figure label="Positions" value={summary.positionsAssigned} basis="47%" />
              <Figure label="Hotspot places" value={summary.hotspotPositionsAssigned} basis="47%" />
              <Figure label="Prizes" value={summary.prizesAwarded} basis="47%" />
              <Figure
                label="Prize total"
                value={money(summary.prizeTotal)}
                tone="text-emerald-600"
                basis="47%"
              />
            </FigureRow>

            <Text className="mt-3 text-xs text-slate-500">
              {[
                summary.raceTypeName ?? "Unknown type",
                summary.prizeRole === "NONE"
                  ? "no prize"
                  : summary.prizeRole.toLowerCase().replace(/_/g, " "),
                summary.skippedUnpaid > 0
                  ? `${summary.skippedUnpaid} unpaid excluded from the final race`
                  : null,
                summary.skippedIgnored > 0 ? `${summary.skippedIgnored} ignored excluded` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>

            {summary.warnings.map((w) => (
              <Notice key={w}>{w}</Notice>
            ))}

            {summary.changedCount === 0 ? (
              <Notice>
                Nothing changes — the stored results already match a fresh calculation.
              </Notice>
            ) : (
              <>
                <Label>
                  {summary.changedCount} bird{summary.changedCount === 1 ? "" : "s"} change
                  {summary.changes.length < summary.changedCount
                    ? ` (showing the first ${Math.min(summary.changes.length, 200)})`
                    : ""}
                </Label>
                <Rows>
                  {summary.changes.slice(0, 200).map((c) => (
                    <Row
                      key={c.raceItemId}
                      title={shortBand(c.band) || "—"}
                      subtitle={`place ${num(c.before.position)} → ${num(c.after.position)} · hotspot ${num(
                        c.before.hotspotPosition
                      )} → ${num(c.after.hotspotPosition)}`}
                      right={money(c.after.prize)}
                      rightSub={`was ${money(c.before.prize)}`}
                    />
                  ))}
                </Rows>
              </>
            )}

            <ButtonRow>
              <Button label="Cancel" tone="secondary" onPress={onClose} full />
              <Button label="Apply changes" tone="danger" onPress={() => setConfirming(true)} full />
            </ButtonRow>
          </>
        )}
      </Sheet>

      <Confirm
        open={open && confirming}
        title="Apply the recalculation?"
        body={
          summary
            ? `${summary.changedCount} bird${
                summary.changedCount === 1 ? "" : "s"
              } change place or prize, and ${money(
                summary.prizeTotal
              )} in prizes is written over what is stored now.`
            : ""
        }
        confirmLabel="Apply"
        pending={apply.pending}
        onConfirm={commit}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

interface LoftBasket {
  id: number;
  label: string | null;
  basketNo: number | null;
  phase: string | null;
  _count?: { assignments?: number };
  assignments?: unknown[];
}

/**
 * Liberating a race — all of it, or only some baskets.
 *
 * The portal asks which loft baskets are going up before it starts the clock,
 * because a race is sometimes released in part. Everything starts ticked; if
 * nothing is unticked the request carries no basket list at all, which is the
 * server's "release everything" and stays right even if a basket is added
 * between opening this sheet and pressing the button.
 */
export function StartRaceSheet({
  open,
  onClose,
  raceId,
  eventId,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
  eventId: number | null;
  onStarted: () => void;
}) {
  const action = useAdminAction();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const { data, loading, forbidden } = useAdminData<{ baskets?: LoftBasket[] }>(
    open && eventId != null ? `/admin/event/${eventId}/baskets?phase=LOFT` : null,
    [open, eventId]
  );
  const baskets = useMemo(
    () => (data?.baskets ?? []).filter((b) => b.phase === "LOFT"),
    [data]
  );

  useEffect(() => {
    if (open) setSelected(new Set(baskets.map((b) => b.id)));
  }, [open, baskets]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const all = selected.size === baskets.length;

  const start = async () => {
    const { ok } = await action.run(
      "post",
      `/admin/race/${raceId}/start`,
      all ? {} : { basketIds: Array.from(selected) },
      { success: "Race started." }
    );
    setConfirming(false);
    if (ok) {
      onClose();
      onStarted();
    }
  };

  return (
    <>
      <Sheet
        open={open && !confirming}
        onClose={onClose}
        title="Start race"
        subtitle="Pick the loft baskets being released"
      >
        {loading ? (
          <Loading />
        ) : baskets.length === 0 ? (
          <Notice>
            {forbidden
              ? "Baskets are not part of your access, so every basketed bird will be released."
              : "No loft baskets found. All basketed birds will be released."}
          </Notice>
        ) : (
          <>
            {baskets.map((b) => (
              <CheckRow
                key={b.id}
                on={selected.has(b.id)}
                label={b.label ?? `Basket #${b.basketNo ?? b.id}`}
                hint={`${b._count?.assignments ?? b.assignments?.length ?? 0} birds`}
                onPress={() => toggle(b.id)}
              />
            ))}
            <ButtonRow>
              <Button
                label="Select all"
                tone="secondary"
                onPress={() => setSelected(new Set(baskets.map((b) => b.id)))}
                full
              />
              <Button label="Clear" tone="secondary" onPress={() => setSelected(new Set())} full />
            </ButtonRow>
          </>
        )}

        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={onClose} full />
          <Button
            label={
              baskets.length === 0
                ? "Release"
                : `Release ${selected.size} basket${selected.size === 1 ? "" : "s"}`
            }
            tone="success"
            icon="paper-plane-outline"
            disabled={baskets.length > 0 && selected.size === 0}
            onPress={() => setConfirming(true)}
            full
          />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={open && confirming}
        title="Start the race?"
        body={`This marks ${
          baskets.length === 0 || all ? "every basketed bird" : `the birds in ${selected.size} basket${selected.size === 1 ? "" : "s"}`
        } as released, starts the clock at this moment and tells everyone with a bird in it. It cannot be undone from here.`}
        confirmLabel="Start race"
        tone="success"
        pending={action.pending}
        onConfirm={start}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One bird in the race                                                */
/* ------------------------------------------------------------------ */

type ManualStatus = "IGNORED" | "STRAY" | "LOST" | "ARRIVED";

const MANUAL: { value: ManualStatus; label: string; blurb: string }[] = [
  {
    value: "IGNORED",
    label: "Did not fly",
    blurb: "Drop this bird from the results. Everything behind it moves up a place.",
  },
  {
    value: "STRAY",
    label: "Stray",
    blurb: "A lost bird that turned up with a later flock. Recorded, but takes no position.",
  },
  {
    value: "LOST",
    label: "Lost",
    blurb: "The bird did not come home. Removed from the results and flagged on the bird.",
  },
  {
    value: "ARRIVED",
    label: "Put back in the results",
    blurb: "Undo the above. Needs an arrival scan on record.",
  },
];

interface Preset {
  id: number;
  code: string | null;
  label: string | null;
  trigger: string | null;
  isActive?: boolean | null;
}

/**
 * Everything the result table knows about one bird, and the two things that can
 * be done to it by hand.
 *
 * The race status is the heavy one — the states no scan produces. Any change
 * re-ranks the whole race and recalculates prize money on the spot, with no
 * preview, so it goes through the confirm step with that said plainly.
 *
 * The display status is the light one: the label breeders see beside the bird,
 * picked from the season's own list. It moves no positions.
 */
export function RaceItemSheet({
  item,
  onClose,
  eventId,
  canManage,
  canPresets,
  onChanged,
}: {
  item: AdminRaceItem | null;
  onClose: () => void;
  eventId: number | null;
  canManage: boolean;
  /** The preset list is guarded by events.manage, separately from the race. */
  canPresets: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const [selected, setSelected] = useState<ManualStatus | null>(null);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [labelling, setLabelling] = useState(false);

  const open = item != null;

  useEffect(() => {
    setSelected(null);
    setNote("");
    setConfirming(false);
    setLabelling(false);
  }, [item?.id]);

  const presetsReq = useAdminData<{ presets?: Preset[] }>(
    labelling && eventId != null ? `/admin/event/${eventId}/status-presets` : null,
    [labelling, eventId]
  );
  const presetChoices: Choice[] = (presetsReq.data?.presets ?? [])
    .filter((p) => p.isActive !== false)
    .map((p) => ({
      key: p.id,
      label: p.label ?? p.code ?? `Status ${p.id}`,
      hint: p.trigger ? p.trigger.toLowerCase() : null,
    }));

  const applyStatus = async () => {
    if (!item || !selected) return;
    const { ok, data } = await action.run<{ message?: string }>(
      "post",
      `/admin/race-item/${item.id}/race-status`,
      { status: selected, ...(note.trim() ? { note: note.trim() } : {}) }
    );
    setConfirming(false);
    if (ok) {
      toast.success(data?.message ?? "Status changed.");
      onClose();
      onChanged();
    }
  };

  const applyPreset = async (presetId: string | number) => {
    if (!item) return;
    const { ok } = await action.run(
      "post",
      `/admin/race-item/${item.id}/status`,
      { presetId: Number(presetId) },
      { success: "Display status set." }
    );
    if (ok) {
      setLabelling(false);
      onClose();
      onChanged();
    }
  };

  const tone = item ? itemStatus(item.status) : null;
  const facts: [string, string][] = item
    ? [
        ["Position", item.birdPosition != null ? String(item.birdPosition) : "—"],
        ["Hotspot", item.birdPositionHotSpot != null ? String(item.birdPositionHotSpot) : "—"],
        [
          "Arrival",
          item.arrivalTime
            ? new Date(item.arrivalTime).toLocaleString(undefined, {
                fractionalSecondDigits: 3,
              } as Intl.DateTimeFormatOptions)
            : "—",
        ],
        [
          "Prize",
          item.prizeValue != null
            ? `${money(item.prizeValue)}${item.birdDrop != null ? ` · drop ${item.birdDrop}` : ""}`
            : item.birdDrop != null
              ? `drop ${item.birdDrop}`
              : "—",
        ],
        ["Breeder", breederOf(item) || "—"],
        ["Loft", item.eventInventoryItem?.eventInventory?.loft ?? "—"],
        ["Loft basket", item.loftBasketLabel ?? "—"],
        ["Race basket", item.raceBasketLabel ?? "—"],
        ["Arrival group", item.groupId != null ? `#${item.groupId}` : "—"],
        ["Entry fees", item.paymentStatus ? item.paymentStatus.toLowerCase() : "—"],
      ]
    : [];

  return (
    <>
      <Sheet
        open={open && !confirming && !labelling}
        onClose={onClose}
        title={item ? bandOf(item) : ""}
        subtitle={
          item
            ? `${item.bird?.birdName ? `${item.bird.birdName} · ` : ""}currently ${tone?.label}`
            : null
        }
      >
        {item && isUnpaid(item) ? (
          <Notice tone="rose">Entry fees on this bird's registration are not fully paid.</Notice>
        ) : null}

        <View className="mt-3">
          <Rows>
            {facts.map(([label, value]) => (
              <Row key={label} title={label} right={value} />
            ))}
          </Rows>
        </View>

        {canManage ? (
          <>
            <Label>Change race status</Label>
            <ChoiceList
              choices={MANUAL.map((m) => ({ key: m.value, label: m.label, hint: m.blurb }))}
              selected={selected}
              onPick={(k) => setSelected(k as ManualStatus)}
            />
            <Field
              label="Why (optional)"
              value={note}
              onChange={setNote}
              hint="Kept in the bird's history."
            />
            <ButtonRow>
              {canPresets ? (
                <Button
                  label="Display status"
                  tone="secondary"
                  onPress={() => setLabelling(true)}
                  full
                />
              ) : null}
              <Button
                label="Apply and re-rank"
                tone="danger"
                disabled={!selected}
                onPress={() => setConfirming(true)}
                full
              />
            </ButtonRow>
          </>
        ) : null}
      </Sheet>

      <Sheet
        open={open && labelling}
        onClose={() => setLabelling(false)}
        title="Display status"
        subtitle="The label shown beside this bird. Positions do not move."
      >
        {presetsReq.loading ? (
          <Loading />
        ) : presetsReq.forbidden ? (
          <Notice>The status list is not part of your access.</Notice>
        ) : (
          <ChoiceList
            choices={presetChoices}
            selected={item?.displayStatusId ?? null}
            onPick={applyPreset}
            empty="No statuses are set up for this season."
          />
        )}
      </Sheet>

      <Confirm
        open={open && confirming}
        title={`Mark ${item ? bandOf(item) : "this bird"} ${
          MANUAL.find((m) => m.value === selected)?.label.toLowerCase() ?? ""
        }?`}
        body="This re-ranks the whole race and recalculates prize money straight away — there is no preview on this one."
        confirmLabel="Apply and re-rank"
        pending={action.pending}
        onConfirm={applyStatus}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scanning by hand, in bulk, or off the reader                         */
/* ------------------------------------------------------------------ */

interface ScanLine {
  ringNo: string;
  scanType: string;
  isNewScan: boolean;
  message: string;
  birdPosition?: number;
}

const SCAN_TONE: Record<string, string> = {
  arrival: "text-emerald-600",
  loft: "text-purple-600",
  phantom: "text-amber-600",
  foreign: "text-rose-600",
  skipped: "text-slate-400",
};

/**
 * Putting tags into the race without a wedge scanner in hand.
 *
 * Three ways in, all ending at the same two routes the portal uses. Typed or
 * pasted tags go one per line — one tag takes the single-scan route, which also
 * tells the owner their bird is home; several go as a batch. A line may carry
 * its own time after a comma, in the reader's YYYYMMDDHHMMSS form, for reads
 * being entered after the fact. And the reader feed is the portal's "Start
 * scanner": it polls for reads the loft's antenna has pushed and scans each one
 * in as it lands.
 *
 * Before the race starts every one of these is a loft-basketing scan, not an
 * arrival — the server decides from the race's status, so the sheet says which
 * it is rather than leaving it to be discovered.
 */
export function RaceScanSheet({
  open,
  onClose,
  raceId,
  raceStatus,
  onScanned,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
  raceStatus: string;
  onScanned: () => void;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const [text, setText] = useState("");
  const [log, setLog] = useState<ScanLine[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const lastTag = useRef<string | null>(null);

  useEffect(() => {
    if (!open) setListening(false);
  }, [open]);

  const scanOne = async (ringNo: string, timestamp: string, quiet = false) => {
    try {
      const { data } = await api.post(`/admin/race/${raceId}/scan`, { ringNo, timestamp });
      const position = data?.birdPosition ?? data?.raceItem?.birdPosition;
      setLog((prev) =>
        [
          {
            ringNo,
            scanType: data?.scanType ?? "skipped",
            isNewScan: data?.isNewScan === true,
            message: data?.message ?? "Scanned.",
            birdPosition: position,
          },
          ...prev,
        ].slice(0, 200)
      );
      if (data?.isNewScan) onScanned();
    } catch (err: any) {
      const said = err?.response?.data?.message ?? "That scan was not accepted.";
      setLog((prev) =>
        [{ ringNo, scanType: "skipped", isNewScan: false, message: said }, ...prev].slice(0, 200)
      );
      if (!quiet) toast.error(said);
    }
  };

  // The reader feed. The poll route hands back reads this network's antenna
  // has pushed since listening began, and marks them taken as it does.
  useEffect(() => {
    if (!listening) return;
    const startedAt = new Date().toISOString();
    lastTag.current = null;
    const timer = setInterval(async () => {
      try {
        const { data } = await api.post("/scanner/poll", { startedAt });
        if (!Array.isArray(data)) return;
        for (const read of data) {
          if (!read?.el || read.el === lastTag.current) continue;
          lastTag.current = read.el;
          const at = read.timestamp ? new Date(read.timestamp) : new Date();
          scanOne(String(read.el), scanStamp(isNaN(at.getTime()) ? new Date() : at), true);
        }
      } catch {
        // A missed poll is not worth a toast every two seconds; the next one retries.
      }
    }, 2000);
    return () => clearInterval(timer);
    // scanOne closes over nothing that changes while listening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, raceId]);

  const submit = async () => {
    const now = Date.now();
    const scans = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [tag, stamp] = line.split(",").map((part) => part.trim());
        return {
          ringNo: tag,
          // A millisecond apart, so tags typed in order keep that order when
          // the server ranks a batch by timestamp.
          timestamp: stamp && /^\d{14,17}$/.test(stamp) ? stamp : scanStamp(new Date(now + index)),
        };
      })
      .filter((s) => s.ringNo.length > 0);

    if (scans.length === 0) {
      toast.error("Enter at least one tag or band.");
      return;
    }
    if (scans.length > 1000) {
      toast.error("A batch takes at most 1,000 scans.");
      return;
    }

    setSummary(null);
    if (scans.length === 1) {
      await scanOne(scans[0].ringNo, scans[0].timestamp);
      setText("");
      return;
    }

    const { ok, data } = await action.run<{
      results?: ScanLine[];
      summary?: { total: number; arrived: number; loft: number; foreign: number; skipped: number };
    }>("post", `/admin/race/${raceId}/scan/batch`, { scans });
    if (ok) {
      const s = data?.summary;
      if (s) {
        setSummary(
          `${s.total} read · ${s.arrived} arrived · ${s.loft} to loft · ${s.foreign} foreign · ${s.skipped} skipped`
        );
      }
      setLog((prev) => [...(data?.results ?? []), ...prev].slice(0, 400));
      setText("");
      onScanned();
    }
  };

  const pre = raceStatus === "REGISTERING";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={pre ? "Loft scan" : "Scan arrivals"}
      subtitle={
        pre
          ? "The race has not started, so each read basket the bird for the loft"
          : raceStatus === "ENDED"
            ? "The race has ended — a read now marks the bird foreign"
            : "Each read is an arrival, timed at the moment it lands"
      }
    >
      <Field
        label="Tags or bands, one per line"
        value={text}
        onChange={setText}
        multiline
        placeholder={"900123456789\n900123456790,20261013093015"}
        hint="Add a comma and YYYYMMDDHHMMSS (UTC) to give a read its own time. More than one line goes as a batch."
      />
      <ButtonRow>
        <Button
          label={listening ? "Stop reader feed" : pre ? "Loft scanner" : "Start scanner"}
          tone={listening ? "danger" : "secondary"}
          icon={listening ? "stop-circle-outline" : "radio-outline"}
          onPress={() => setListening((v) => !v)}
          full
        />
        <Button label="Scan" icon="scan-outline" onPress={submit} pending={action.pending} full />
      </ButtonRow>
      {listening ? (
        <Notice>
          Listening for reads from the loft's antenna on this network. Keep this sheet open.
        </Notice>
      ) : null}

      {summary ? <Notice>{summary}</Notice> : null}

      {log.length > 0 ? (
        <View className="mt-3">
          <Rows>
            {log.map((line, index) => (
              <Row
                key={`${line.ringNo}-${index}`}
                title={line.ringNo}
                subtitle={line.message}
                right={line.birdPosition != null ? `#${line.birdPosition}` : line.scanType}
                rightTone={SCAN_TONE[line.scanType] ?? "text-slate-600"}
              />
            ))}
          </Rows>
        </View>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Arrival groups                                                      */
/* ------------------------------------------------------------------ */

interface ArrivalGroup {
  id: number;
  name: string | null;
  arrivalTimeStart: string | null;
  arrivalTimeEnd: string | null;
  _count?: { results?: number };
}

/**
 * Drops — birds that came home together, grouped by the gap between them.
 *
 * Grouping is all-or-nothing on the server: it throws away every existing group
 * for the race and rebuilds them from the arrival times, so it is confirmed,
 * and the gap is the only thing to decide. A single group can be dissolved
 * without touching the rest.
 */
export function ArrivalGroupsSheet({
  open,
  onClose,
  raceId,
  canManage,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
  canManage: boolean;
  onChanged: () => void;
}) {
  const action = useAdminAction();
  const [gap, setGap] = useState("");
  const [confirming, setConfirming] = useState(false);

  const { data, loading, error, reload } = useAdminData<{ groups?: ArrivalGroup[] }>(
    open ? `/admin/race/${raceId}/arrival-groups` : null,
    [open, raceId]
  );
  const groups = data?.groups ?? [];

  const regroup = async () => {
    const seconds = parseFloat(gap.trim());
    const { ok } = await action.run(
      "post",
      `/admin/race/${raceId}/arrival-groups`,
      !isNaN(seconds) && seconds > 0 ? { gapSeconds: seconds } : {},
      { success: "Arrivals grouped." }
    );
    setConfirming(false);
    if (ok) {
      reload();
      onChanged();
    }
  };

  const remove = async (group: ArrivalGroup) => {
    const { ok } = await action.run(
      "delete",
      `/admin/race/${raceId}/arrival-groups?id=${group.id}`,
      undefined,
      { success: "Group removed." }
    );
    if (ok) {
      reload();
      onChanged();
    }
  };

  const span = (g: ArrivalGroup) =>
    g.arrivalTimeStart
      ? `${new Date(g.arrivalTimeStart).toLocaleTimeString()}${
          g.arrivalTimeEnd && g.arrivalTimeEnd !== g.arrivalTimeStart
            ? ` – ${new Date(g.arrivalTimeEnd).toLocaleTimeString()}`
            : ""
        }`
      : "no times";

  return (
    <>
      <Sheet
        open={open && !confirming}
        onClose={onClose}
        title="Arrival groups"
        subtitle={`${groups.length} drop${groups.length === 1 ? "" : "s"} on this race`}
      >
        {loading ? (
          <Loading />
        ) : error ? (
          <Notice>{error}</Notice>
        ) : groups.length === 0 ? (
          <View className="mt-2">
            <Empty>Arrivals have not been grouped on this race.</Empty>
          </View>
        ) : (
          <View className="mt-2">
            <Rows>
              {groups.map((g) => (
                <Row
                  key={g.id}
                  title={g.name ?? `Group ${g.id}`}
                  subtitle={`#${g.id} · ${span(g)}`}
                  right={`${g._count?.results ?? 0} birds`}
                  rightSub={canManage ? "tap to remove" : undefined}
                  onPress={canManage ? () => remove(g) : undefined}
                />
              ))}
            </Rows>
          </View>
        )}

        {canManage ? (
          <>
            <Field
              label="Gap between drops (seconds)"
              value={gap}
              onChange={setGap}
              keyboard="numeric"
              placeholder="Server default"
              hint="Birds arriving closer together than this land in the same group."
            />
            <ButtonRow>
              <Button
                label={groups.length > 0 ? "Regroup arrivals" : "Group arrivals"}
                icon="git-merge-outline"
                onPress={() => setConfirming(true)}
                full
              />
            </ButtonRow>
          </>
        ) : null}
      </Sheet>

      <Confirm
        open={open && confirming}
        title="Group the arrivals?"
        body={
          groups.length > 0
            ? `The ${groups.length} existing group${
                groups.length === 1 ? " is" : "s are"
              } thrown away and rebuilt from the arrival times.`
            : "Every clocked bird is put into a group by the gap between arrivals."
        }
        confirmLabel="Group"
        tone="primary"
        pending={action.pending}
        onConfirm={regroup}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* What breeders see                                                   */
/* ------------------------------------------------------------------ */

const VISIBLE_STATUSES: { value: string; label: string }[] = [
  { value: "REGISTERED", label: "Registered" },
  { value: "CHECKED_IN", label: "Checked in" },
  { value: "LOFT_BASKETED", label: "Loft basketed" },
  { value: "RELEASED", label: "Released" },
  { value: "ARRIVED", label: "Arrived" },
  { value: "FOREIGN_BIRD", label: "Foreign bird" },
];

/**
 * Which bird statuses breeders are shown on this race.
 *
 * A switch per status, saved as it is pressed — the same eye icon the portal
 * keeps in its status filter. Staff always see everything; this only decides
 * the breeder view.
 */
export function StatusVisibilitySheet({
  open,
  onClose,
  raceId,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
  canManage: boolean;
}) {
  const action = useAdminAction();
  const { data, loading, error, reload } = useAdminData<{
    visibility?: { status: string; visible: boolean }[];
  }>(open ? `/admin/race/${raceId}/status-visibility` : null, [open, raceId]);

  const shown = new Map((data?.visibility ?? []).map((v) => [v.status, v.visible]));

  const toggle = async (status: string) => {
    const { ok } = await action.run("patch", `/admin/race/${raceId}/status-visibility`, {
      status,
      visible: !(shown.get(status) ?? true),
    });
    if (ok) reload();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Breeder view"
      subtitle="Statuses breeders can see on this race"
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <Notice>{error}</Notice>
      ) : (
        VISIBLE_STATUSES.map((s) => (
          <CheckRow
            key={s.value}
            on={shown.get(s.value) ?? true}
            label={s.label}
            hint={(shown.get(s.value) ?? true) ? "Visible to breeders" : "Hidden from breeders"}
            disabled={!canManage || action.pending}
            onPress={() => toggle(s.value)}
          />
        ))
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Wind along the route                                                */
/* ------------------------------------------------------------------ */

interface WindSample {
  distMiles: number;
  tempK: number;
  wind: {
    speedMph: number;
    dirFrom: number;
    tailMs: number;
    crossMs: number;
    crossSide: "left" | "right";
    kind: "tailwind" | "headwind" | "crosswind";
  };
}

interface WindRoute {
  flightBearing: number;
  release: { label: string };
  dest: { label: string };
  samples: WindSample[];
  meta?: { startTimeMs: number | null };
}

const MS_TO_MPH = 2.236936;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

/**
 * What the birds fly into, release point to loft.
 *
 * The portal draws this as arrows over a map. A phone gets the reading behind
 * the arrows instead: the net push along the line of flight, which is the one
 * number that predicts a fast or slow race, and then the wind at intervals down
 * the route so a headwind waiting at the far end is not averaged away.
 */
export function WindRouteSheet({
  open,
  onClose,
  raceId,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
}) {
  const { data, loading, error, forbidden } = useAdminData<WindRoute>(
    open ? `/race/${raceId}/wind-route` : null,
    [open, raceId]
  );

  const samples = data?.samples ?? [];
  const mean = (pick: (s: WindSample) => number) =>
    samples.length > 0 ? samples.reduce((sum, s) => sum + pick(s), 0) / samples.length : 0;
  const tail = mean((s) => s.wind.tailMs) * MS_TO_MPH;
  const speed = mean((s) => s.wind.speedMph);
  const temp = mean((s) => s.tempK) - 273.15;
  const total = samples.length > 0 ? samples[samples.length - 1].distMiles : 0;

  // About a dozen readings, whatever the distance.
  const step = Math.max(1, Math.ceil(samples.length / 12));
  const shown = samples.filter((_, i) => i % step === 0 || i === samples.length - 1);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Wind on the route"
      subtitle={
        data
          ? `${data.release.label} → ${data.dest.label}${
              data.meta?.startTimeMs ? ` · ${new Date(data.meta.startTimeMs).toLocaleString()}` : ""
            }`
          : null
      }
    >
      {loading ? (
        <Loading />
      ) : forbidden ? (
        <Notice>The wind forecast is not part of your access.</Notice>
      ) : error ? (
        <Notice>{error}</Notice>
      ) : samples.length === 0 ? (
        <Empty>No forecast came back for this route.</Empty>
      ) : (
        <>
          <FigureRow>
            <Figure
              label={tail >= 0 ? "Tailwind (mph)" : "Headwind (mph)"}
              value={Math.abs(tail).toFixed(1)}
              tone={tail >= 0 ? "text-emerald-600" : "text-rose-600"}
              basis="47%"
            />
            <Figure label="Wind speed (mph)" value={speed.toFixed(1)} basis="47%" />
            <Figure label="Flight bearing" value={`${Math.round(data!.flightBearing)}° ${compass(data!.flightBearing)}`} basis="47%" />
            <Figure label="Temperature (°C)" value={temp.toFixed(1)} basis="47%" />
          </FigureRow>

          <Label>Along the {Math.round(total)} miles</Label>
          <Rows>
            {shown.map((s) => (
              <Row
                key={s.distMiles}
                title={`Mile ${Math.round(s.distMiles)}`}
                subtitle={`${s.wind.kind} · from ${compass(s.wind.dirFrom)} · cross ${(
                  s.wind.crossMs * MS_TO_MPH
                ).toFixed(1)} mph ${s.wind.crossSide}`}
                right={`${s.wind.speedMph.toFixed(1)} mph`}
                rightSub={`${(s.tempK - 273.15).toFixed(0)}°C`}
                rightTone={
                  s.wind.kind === "tailwind"
                    ? "text-emerald-600"
                    : s.wind.kind === "headwind"
                      ? "text-rose-600"
                      : "text-slate-600"
                }
              />
            ))}
          </Rows>
        </>
      )}
    </Sheet>
  );
}
