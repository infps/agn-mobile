import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import { Button, ButtonRow, type Choice, ChoiceList, Field, Sheet } from "@/components/admin/ui";
import { type AdminRace, CheckRow, Label, Pills } from "@/components/admin/raceParts";

interface Station {
  id: number;
  name: string | null;
  miles: number | null;
  latitude: number | null;
  longitude: number | null;
  isActive?: boolean | null;
  stationRaceTypes?: { raceTypeId: number }[];
}

/** The portal's weather list, in the portal's order — the values are stored as typed. */
const WEATHER = [
  "Clear Sky",
  "Partly Cloudy",
  "Cloudy",
  "Overcast",
  "Light Rain",
  "Rain",
  "Heavy Rain",
  "Thunderstorm",
  "Drizzle",
  "Snow",
  "Light Snow",
  "Sleet",
  "Fog",
  "Mist",
  "Haze",
  "Windy",
  "Sunny",
];

/** WMO weather codes, as Open-Meteo reports them, to the labels above. */
function codeToWeather(code: number): string {
  if (code === 0) return "Clear Sky";
  if (code === 1 || code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code === 56 || code === 57) return "Sleet";
  if (code === 61 || code === 80) return "Light Rain";
  if (code === 63 || code === 81) return "Rain";
  if (code === 65 || code === 82) return "Heavy Rain";
  if (code === 66 || code === 67) return "Sleet";
  if (code === 71 || code === 77) return "Light Snow";
  if (code === 73 || code === 75 || code === 85 || code === 86) return "Snow";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}

/**
 * The forecast for one point at one hour.
 *
 * The portal asks Open-Meteo for this straight from the browser, so this does
 * the same from the phone — there is no portal route to go through. Past the
 * sixteen-day horizon the archive answers instead of the forecast.
 */
async function fetchForecast(lat: number, lon: number, local: string) {
  const date = local.slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 16);
  const host = new Date(date) < cutoff ? "archive-api.open-meteo.com/v1/archive" : "api.open-meteo.com/v1/forecast";
  const res = await fetch(
    `https://${host}?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,wind_speed_10m,weather_code&wind_speed_unit=kmh&timezone=auto` +
      `&start_date=${date}&end_date=${date}`
  );
  if (!res.ok) {
    throw new Error(
      res.status === 400
        ? "No forecast for that date — it is probably past the 16-day horizon."
        : `The forecast service answered ${res.status}.`
    );
  }
  const data = await res.json();
  const times: string[] = data?.hourly?.time ?? [];
  if (times.length === 0) throw new Error("No forecast is available for that date.");

  const hour = local.slice(0, 13);
  let idx = times.findIndex((t) => t.slice(0, 13) === hour);
  if (idx < 0) idx = times.findIndex((t) => t.endsWith("T12:00"));
  if (idx < 0) idx = 0;

  const temp = Number(data.hourly.temperature_2m?.[idx]);
  const wind = Number(data.hourly.wind_speed_10m?.[idx]);
  if (Number.isNaN(temp) || Number.isNaN(wind)) throw new Error("The forecast came back incomplete.");
  return {
    temperature: String(Math.round(temp * 10) / 10),
    wind: `${Math.round(wind)} km/h`,
    weather: codeToWeather(Number(data.hourly.weather_code?.[idx])),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant, as the local "YYYY-MM-DD HH:MM" somebody would type. */
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
};

const toClock = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "YYYY-MM-DD HH:MM" (time optional) back to a Date in the phone's zone. */
function parseLocal(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return isNaN(d.getTime()) ? null : d;
}

/** A time of day on the same date as the start, which is how the portal stores sun times. */
function clockOn(day: Date, raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(day);
  d.setHours(+m[1], +m[2], 0, 0);
  return d;
}

const EMPTY = {
  raceTypeId: null as number | null,
  raceStationId: null as number | null,
  name: "",
  raceNumber: "",
  description: "",
  distance: "",
  location: "",
  season: "",
  startTime: "",
  sunrise: "",
  sunset: "",
  temperature: "",
  wind: "",
  weather: "",
  arrivalTemperature: "",
  arrivalWind: "",
  arrivalWeather: "",
  isClosed: false,
  isPrivate: false,
};

/**
 * Writing a race, new or existing.
 *
 * The same fields the portal's dialog has, in the order a race gets decided:
 * what it is, where it starts, when, and then the conditions on the day — which
 * are usually blank when the race is created and filled in on the morning, so
 * they sit last and nothing below the date is required.
 *
 * Picking a launch station locks the distance, exactly as it does in the
 * portal: the server works it out from the station to the loft and ignores a
 * typed figure, so the field says so instead of accepting a number that would
 * be thrown away.
 *
 * "Closed" is only sent when somebody actually changes it. The route treats it
 * as an instruction, not a fact — sending "not closed" for a race re-opens it
 * and resets its status from the start time — so echoing the stored value back
 * on every save would quietly start races whose scheduled time has passed.
 */
export function RaceFormSheet({
  open,
  onClose,
  eventId,
  race,
  onSaved,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  eventId: number | null;
  /** Null writes a new race. */
  race: AdminRace | null;
  onSaved: () => void;
  onDelete?: (race: AdminRace) => void;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const [form, setForm] = useState({ ...EMPTY });
  const [fetching, setFetching] = useState(false);

  // All three are only needed while a race is being written, so they are
  // fetched then rather than on every visit to the list.
  const typesReq = useAdminData<{ raceTypes?: { id: number; name: string | null }[] }>(
    open ? "/admin/race-type" : null,
    [open]
  );
  const stationsReq = useAdminData<{ stations?: Station[] }>(
    open && eventId != null ? `/admin/event/${eventId}/stations` : null,
    [open, eventId]
  );
  const eventReq = useAdminData<{
    event?: { latitude: number | null; longitude: number | null; locationAddress?: string | null };
  }>(open && eventId != null ? `/admin/event?eventId=${eventId}` : null, [open, eventId]);

  const defaultLocation = eventReq.data?.event?.locationAddress ?? "";

  useEffect(() => {
    if (!open) return;
    if (!race) {
      setForm({ ...EMPTY, startTime: toLocal(new Date().toISOString()) });
      return;
    }
    setForm({
      raceTypeId: race.raceTypeId ?? null,
      raceStationId: race.raceStationId ?? null,
      name: race.name ?? "",
      raceNumber: race.raceNumber != null ? String(race.raceNumber) : "",
      description: race.description ?? "",
      distance: race.distance != null ? String(race.distance) : "",
      location: race.location ?? "",
      season: race.season ?? "",
      startTime: toLocal(race.startTime),
      sunrise: toClock(race.sunrise),
      sunset: toClock(race.sunset),
      temperature: race.temperature ?? "",
      wind: race.wind ?? "",
      weather: race.weather ?? "",
      arrivalTemperature: race.arrivalTemperature ?? "",
      arrivalWind: race.arrivalWind ?? "",
      arrivalWeather: race.arrivalWeather ?? "",
      isClosed: race.isClosed === 1,
      isPrivate: race.isPrivate === true,
    });
    // Only when the sheet opens or the race changes — not on every reload of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, race?.id]);

  // A new race starts at the loft's address, as it does in the portal, once
  // that has loaded — but never over something already typed.
  useEffect(() => {
    if (open && !race && defaultLocation) {
      setForm((f) => (f.location ? f : { ...f, location: defaultLocation }));
    }
  }, [open, race, defaultLocation]);

  const stations = (stationsReq.data?.stations ?? []).filter((s) => s.isActive !== false);
  const station = stations.find((s) => s.id === form.raceStationId) ?? null;

  const typeChoices: Choice[] = (typesReq.data?.raceTypes ?? []).map((t) => ({
    key: t.id,
    label: t.name ?? `Type ${t.id}`,
  }));
  const stationChoices: Choice[] = [
    { key: 0, label: "No station", hint: "Type the distance by hand" },
    ...stations.map((s) => ({
      key: s.id,
      label: s.name ?? `Station ${s.id}`,
      hint: s.miles != null ? `${s.miles.toFixed(2)} mi` : null,
    })),
  ];

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const pickStation = (key: string | number) => {
    const id = Number(key) || null;
    const picked = stations.find((s) => s.id === id);
    // A station that only ever runs one race type fills the type in for you.
    const only = picked?.stationRaceTypes?.length === 1 ? picked.stationRaceTypes[0].raceTypeId : null;
    set({ raceStationId: id, raceTypeId: only ?? form.raceTypeId });
  };

  /**
   * One press fills both blocks: the release forecast at the launch station,
   * the arrival forecast at the loft, both for the hour of the start.
   */
  const fillForecast = async () => {
    if (station?.latitude == null || station?.longitude == null) {
      toast.error("Pick a launch station with coordinates first.");
      return;
    }
    const start = parseLocal(form.startTime);
    if (!start) {
      toast.error("Set the start time first, as YYYY-MM-DD HH:MM.");
      return;
    }
    const local = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(
      start.getHours()
    )}:${pad(start.getMinutes())}`;
    const loft = eventReq.data?.event;
    const hasLoft = loft?.latitude != null && loft?.longitude != null;

    setFetching(true);
    try {
      const [release, arrival] = await Promise.all([
        fetchForecast(station.latitude, station.longitude, local),
        hasLoft ? fetchForecast(loft!.latitude!, loft!.longitude!, local) : Promise.resolve(null),
      ]);
      set({
        ...release,
        ...(arrival
          ? {
              arrivalTemperature: arrival.temperature,
              arrivalWind: arrival.wind,
              arrivalWeather: arrival.weather,
            }
          : {}),
      });
      toast.success(
        arrival
          ? "Forecast filled for release and arrival."
          : "Release forecast filled. The loft has no coordinates for the arrival."
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Could not fetch the forecast.");
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    const isNew = race == null;
    if (!form.name.trim()) {
      toast.error("Give the race a name.");
      return;
    }
    if (isNew && form.raceTypeId == null) {
      toast.error("Pick the race type.");
      return;
    }
    if (isNew && eventId == null) {
      toast.error("Pick the event first.");
      return;
    }

    const start = form.startTime.trim() ? parseLocal(form.startTime) : null;
    if (form.startTime.trim() && !start) {
      toast.error("The start time has to read YYYY-MM-DD HH:MM.");
      return;
    }
    const day = start ?? new Date();
    const sunrise = form.sunrise.trim() ? clockOn(day, form.sunrise) : null;
    const sunset = form.sunset.trim() ? clockOn(day, form.sunset) : null;
    if ((form.sunrise.trim() && !sunrise) || (form.sunset.trim() && !sunset)) {
      toast.error("Sunrise and sunset have to read HH:MM.");
      return;
    }

    const num = (raw: string) => {
      const v = parseFloat(raw.trim());
      return isNaN(v) ? null : v;
    };
    const text = (raw: string) => raw.trim() || null;

    const hadStation = race?.raceStationId != null;
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      raceNumber: num(form.raceNumber),
      description: text(form.description),
      location: form.location.trim(),
      season: text(form.season),
      ...(form.raceTypeId != null ? { raceTypeId: form.raceTypeId } : {}),
      ...(start ? { startTime: start.toISOString() } : {}),
      ...(sunrise ? { sunrise: sunrise.toISOString() } : {}),
      ...(sunset ? { sunset: sunset.toISOString() } : {}),
      temperature: num(form.temperature),
      wind: text(form.wind),
      weather: text(form.weather),
      arrivalTemperature: num(form.arrivalTemperature),
      arrivalWind: text(form.arrivalWind),
      arrivalWeather: text(form.arrivalWeather),
      isPrivate: form.isPrivate,
    };

    // The station decides the distance when there is one. Sending the station
    // key at all — even empty — makes the update route skip a typed distance,
    // so it is only sent when a station is set or is being taken off.
    if (form.raceStationId != null) body.raceStationId = form.raceStationId;
    else if (hadStation) body.raceStationId = null;
    else if (num(form.distance) != null) body.distance = Math.round(num(form.distance)!);

    if (isNew ? form.isClosed : form.isClosed !== (race.isClosed === 1)) {
      body.isClosed = form.isClosed ? 1 : 0;
    }

    const { ok } = await action.run(
      isNew ? "post" : "put",
      "/admin/race",
      isNew ? { ...body, eventId } : { ...body, raceId: race.id },
      { success: isNew ? "Race created." : "Race updated." }
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
      title={race ? "Edit race" : "New race"}
      subtitle={race ? race.name || `Race ${race.raceNumber ?? race.id}` : "Conditions can wait until the day"}
    >
      <Label>Race type</Label>
      <ChoiceList
        choices={typeChoices}
        selected={form.raceTypeId}
        onPick={(k) => set({ raceTypeId: Number(k) })}
        empty={typesReq.loading ? "Loading race types…" : "No race types are set up."}
      />

      <Field label="Name" value={form.name} onChange={(v) => set({ name: v })} placeholder="Spring Classic 2026" />
      <Field
        label="Race number"
        value={form.raceNumber}
        onChange={(v) => set({ raceNumber: v })}
        keyboard="numeric"
      />
      <Field label="Location" value={form.location} onChange={(v) => set({ location: v })} />
      <Field
        label="Description"
        value={form.description}
        onChange={(v) => set({ description: v })}
        hint="Shown as the race's heading in the portal."
      />
      <Field label="Season" value={form.season} onChange={(v) => set({ season: v })} placeholder="YB25" />

      <Label>Launch station</Label>
      <ChoiceList
        choices={stationChoices}
        selected={form.raceStationId ?? 0}
        onPick={pickStation}
      />
      {stationsReq.forbidden ? (
        <Text className="mt-1 text-xs text-slate-400">
          Stations are not part of your access, so only a typed distance is available.
        </Text>
      ) : null}

      {station ? (
        <Text className="mt-3 text-xs text-slate-500">
          Distance is locked to the station
          {station.miles != null ? ` — ${Math.round(station.miles)} mi` : ", worked out from its coordinates"}.
        </Text>
      ) : (
        <Field
          label="Distance (miles)"
          value={form.distance}
          onChange={(v) => set({ distance: v })}
          keyboard="numeric"
          hint={
            race?.raceStationId != null
              ? "Taking the station off keeps the last distance; change it in a second save."
              : "Whole miles."
          }
        />
      )}

      <Field
        label="Start time"
        value={form.startTime}
        onChange={(v) => set({ startTime: v })}
        placeholder="YYYY-MM-DD HH:MM"
        hint="In this phone's time zone. Starting the race stamps the real release time over it."
      />
      <View className="flex-row" style={{ gap: 8 }}>
        <View className="flex-1">
          <Field label="Sunrise" value={form.sunrise} onChange={(v) => set({ sunrise: v })} placeholder="HH:MM" />
        </View>
        <View className="flex-1">
          <Field label="Sunset" value={form.sunset} onChange={(v) => set({ sunset: v })} placeholder="HH:MM" />
        </View>
      </View>

      <View className="mt-5 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-slate-900">Release conditions</Text>
        <Button
          label="Fetch forecast"
          tone="secondary"
          icon="partly-sunny-outline"
          onPress={fillForecast}
          pending={fetching}
        />
      </View>
      <View className="flex-row" style={{ gap: 8 }}>
        <View className="flex-1">
          <Field
            label="Temperature (°C)"
            value={form.temperature}
            onChange={(v) => set({ temperature: v })}
            keyboard="decimal-pad"
          />
        </View>
        <View className="flex-1">
          <Field label="Wind" value={form.wind} onChange={(v) => set({ wind: v })} />
        </View>
      </View>
      <Label>Weather</Label>
      <Pills
        wrap
        pills={WEATHER.map((w) => ({ key: w, label: w }))}
        isOn={(k) => form.weather === k}
        onPress={(k) => set({ weather: form.weather === k ? "" : String(k) })}
      />

      <Text className="mt-5 text-sm font-semibold text-slate-900">Arrival conditions</Text>
      <View className="flex-row" style={{ gap: 8 }}>
        <View className="flex-1">
          <Field
            label="Temperature (°C)"
            value={form.arrivalTemperature}
            onChange={(v) => set({ arrivalTemperature: v })}
            keyboard="decimal-pad"
          />
        </View>
        <View className="flex-1">
          <Field label="Wind" value={form.arrivalWind} onChange={(v) => set({ arrivalWind: v })} />
        </View>
      </View>
      <Label>Weather</Label>
      <Pills
        wrap
        pills={WEATHER.map((w) => ({ key: w, label: w }))}
        isOn={(k) => form.arrivalWeather === k}
        onPress={(k) => set({ arrivalWeather: form.arrivalWeather === k ? "" : String(k) })}
      />

      <View className="mt-4">
        <CheckRow
          on={form.isPrivate}
          label="Private race"
          hint="Hidden from breeders who do not have a bird entered in it."
          onPress={() => set({ isPrivate: !form.isPrivate })}
        />
        <CheckRow
          on={form.isClosed}
          label="Mark as closed"
          hint={
            race
              ? "Changing this sets the race to ended, or re-opens it. It does not settle results — use End race for that."
              : "Creates the race already closed."
          }
          onPress={() => set({ isClosed: !form.isClosed })}
        />
      </View>

      <ButtonRow>
        {race && onDelete ? (
          <Button
            label="Delete"
            tone="secondary"
            onPress={() => {
              onClose();
              onDelete(race);
            }}
            full
          />
        ) : (
          <Button label="Cancel" tone="secondary" onPress={onClose} full />
        )}
        <Button label="Save" onPress={save} pending={action.pending} full />
      </ButtonRow>
    </Sheet>
  );
}
