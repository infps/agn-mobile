import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import { MAPS_AVAILABLE, MapUnavailable } from "@/components/MapUnavailable";

/**
 * A map of race routes, drawn over the portal's own free tile layers.
 *
 * `RaceTrackMap` answers one question — where is this race's transport — and
 * fetches its own data to do it. The other race maps (every race in the air at
 * once, the wind along a route, where the truck has been over a week) all draw
 * lines and pins that the screen has already loaded, so this one takes them as
 * props and does nothing but draw.
 *
 * The three tile sources are the same ones `RaceTrackMap` and the portal use.
 * None needs an API key.
 */
const LAYERS = [
  { key: "street", label: "Street", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" },
  { key: "terrain", label: "Terrain", url: "https://tile.opentopomap.org/{z}/{x}/{y}.png" },
  {
    key: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
] as const;

const MAP_MAX_ZOOM = 17;

export interface RouteLine {
  id: string;
  points: { latitude: number; longitude: number }[];
  color: string;
  width?: number;
  dashed?: boolean;
}

export interface RoutePin {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  color: string;
  /** Faded pins are races that have not started yet. */
  faded?: boolean;
  /** A small dot rather than a full pin — used for samples along a route. */
  dot?: boolean;
  onPress?: () => void;
  /** Fired when the callout bubble is tapped, e.g. to open the race. */
  onCalloutPress?: () => void;
}

const finite = (p: { latitude: unknown; longitude: unknown }): boolean =>
  Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

export function RaceRouteMap({
  lines: rawLines,
  pins: rawPins,
  height = 320,
  emptyText = "There is nothing to map yet.",
}: {
  lines: RouteLine[];
  pins: RoutePin[];
  height?: number;
  emptyText?: string;
}) {
  const [layer, setLayer] = useState<(typeof LAYERS)[number]["key"]>("street");
  const mapRef = useRef<MapView | null>(null);

  // A null coordinate reaching the native map crashes the app outright.
  const lines = useMemo(
    () => rawLines.map((l) => ({ ...l, points: l.points.filter(finite) })),
    [rawLines]
  );
  const pins = useMemo(() => rawPins.filter(finite), [rawPins]);

  const all = useMemo(() => {
    const out: { latitude: number; longitude: number }[] = [];
    lines.forEach((l) => out.push(...l.points));
    pins.forEach((p) => out.push({ latitude: p.latitude, longitude: p.longitude }));
    return out;
  }, [lines, pins]);

  // Re-frame only when the set of coordinates changes, not on every refresh
  // that returns the same places — otherwise a 30s poll would snap the map
  // back while somebody is panning it.
  const frameKey = useMemo(
    () => all.map((p) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).join(";"),
    [all]
  );

  useEffect(() => {
    if (all.length === 0 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(all, {
      edgePadding: { top: 56, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  if (all.length === 0) {
    return (
      <View
        className="items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6"
        style={{ height }}
      >
        <Text className="text-center text-sm text-slate-500">{emptyText}</Text>
      </View>
    );
  }

  if (!MAPS_AVAILABLE) return <MapUnavailable height={height} />;

  const active = LAYERS.find((l) => l.key === layer) ?? LAYERS[0];

  return (
    <View className="overflow-hidden rounded-xl border border-slate-200" style={{ height }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        mapType="none"
        maxZoomLevel={MAP_MAX_ZOOM}
        initialRegion={{
          latitude: all[0].latitude,
          longitude: all[0].longitude,
          latitudeDelta: 2,
          longitudeDelta: 2,
        }}
      >
        <UrlTile
          key={active.key}
          urlTemplate={active.url}
          maximumZ={MAP_MAX_ZOOM}
          shouldReplaceMapContent
          zIndex={-1}
        />

        {lines.map((l) =>
          l.points.length > 1 ? (
            <Polyline
              key={l.id}
              coordinates={l.points}
              strokeColor={l.color}
              strokeWidth={l.width ?? 3}
              lineDashPattern={l.dashed ? [6, 6] : undefined}
            />
          ) : null
        )}

        {pins.map((p) =>
          p.dot ? (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              title={p.title}
              description={p.description}
              onPress={p.onPress}
              onCalloutPress={p.onCalloutPress}
              tracksViewChanges={false}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: p.color,
                  borderWidth: 1.5,
                  borderColor: "#1e3a8a",
                }}
              />
            </Marker>
          ) : (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              title={p.title}
              description={p.description}
              pinColor={p.color}
              opacity={p.faded ? 0.6 : 1}
              onPress={p.onPress}
              onCalloutPress={p.onCalloutPress}
            />
          )
        )}
      </MapView>

      <View className="absolute right-2 top-2 overflow-hidden rounded-lg border border-slate-300 bg-white">
        {LAYERS.map((l, i) => (
          <Pressable
            key={l.key}
            onPress={() => setLayer(l.key)}
            className={`px-3 py-1.5 ${i > 0 ? "border-t border-slate-200" : ""} ${
              l.key === layer ? "bg-cyan-600" : "bg-white"
            }`}
          >
            <Text
              className={`text-[11px] font-medium ${
                l.key === layer ? "text-white" : "text-slate-600"
              }`}
            >
              {l.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
