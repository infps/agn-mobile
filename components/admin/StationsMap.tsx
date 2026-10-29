import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import MapView, { Marker, UrlTile } from "react-native-maps";
import { MAPS_AVAILABLE, MapUnavailable } from "@/components/MapUnavailable";

export interface MapPoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  miles?: number | null;
  color?: string | null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * The portal's three base layers, from the same free sources — the same list
 * `RaceTrackMap` carries, for the same reason: a station should look the same
 * on a phone as on the desk it was placed from. None of them needs a key.
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

/** OpenTopoMap caps at 17; every layer is held there so switching never re-clamps. */
const MAP_MAX_ZOOM = 17;

/**
 * Liberation points on a map, and the way to put one there.
 *
 * One component does both jobs the portal gives to two, because they differ
 * only in what a tap means. Showing: the loft in green, every station as a
 * pin, the selected one in the foreground — tap a pin to select it. Picking:
 * one pin, and a tap anywhere moves it.
 *
 * `mapType="none"` stops the platform drawing its own base map underneath, so
 * what shows is the portal's imagery and nothing else.
 */
export function StationsMap({
  base,
  stations = [],
  selectedId = null,
  onSelect,
  picked,
  onPick,
  height = 300,
}: {
  /** The event's loft: where every distance is measured from. */
  base: (LatLng & { name?: string | null }) | null;
  stations?: MapPoint[];
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  /** Present in picking mode: the point being placed, if it has been. */
  picked?: LatLng | null;
  /** Given in picking mode: a tap on the map calls it. */
  onPick?: (lat: number, lng: number) => void;
  height?: number;
}) {
  const [layer, setLayer] = useState<(typeof LAYERS)[number]["key"]>("street");
  const mapRef = useRef<MapView | null>(null);
  const picking = onPick != null;

  // Keep everything worth seeing in frame as the list is filtered.
  const frame = stations.map((s) => `${s.id}:${s.lat},${s.lng}`).join("|");
  useEffect(() => {
    if (picking) return;
    const coords = [
      ...(base ? [{ latitude: base.lat, longitude: base.lng }] : []),
      ...stations.map((s) => ({ latitude: s.lat, longitude: s.lng })),
    ];
    if (coords.length < 2) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(timer);
    // `frame` stands in for the station list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, base?.lat, base?.lng, picking]);

  // Selecting from the list brings the pin to the middle.
  useEffect(() => {
    const s = stations.find((x) => x.id === selectedId);
    if (!s || picking) return;
    mapRef.current?.animateToRegion(
      { latitude: s.lat, longitude: s.lng, latitudeDelta: 0.6, longitudeDelta: 0.6 },
      400
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // A pasted coordinate should be looked at, not merely stored.
  useEffect(() => {
    if (!picking || !picked) return;
    mapRef.current?.animateToRegion(
      { latitude: picked.lat, longitude: picked.lng, latitudeDelta: 0.4, longitudeDelta: 0.4 },
      400
    );
  }, [picking, picked?.lat, picked?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const centre = picked ?? base ?? (stations[0] ? { lat: stations[0].lat, lng: stations[0].lng } : null);

  if (!centre) {
    return (
      <View
        className="items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6"
        style={{ height }}
      >
        <Text className="text-center text-sm text-slate-500">
          There is nothing to map yet — neither the event nor any station has coordinates.
        </Text>
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
          latitude: centre.lat,
          longitude: centre.lng,
          latitudeDelta: picking ? 1.5 : 3,
          longitudeDelta: picking ? 1.5 : 3,
        }}
        onPress={(e) => {
          if (picking) {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            onPick(latitude, longitude);
          } else {
            onSelect?.(null);
          }
        }}
      >
        <UrlTile
          // Keyed so switching layers remounts the tile source rather than
          // leaving the previous one's cached tiles on screen.
          key={active.key}
          urlTemplate={active.url}
          maximumZ={MAP_MAX_ZOOM}
          shouldReplaceMapContent
          zIndex={-1}
        />

        {base ? (
          <Marker
            coordinate={{ latitude: base.lat, longitude: base.lng }}
            title={base.name ?? "Event"}
            description="Loft — distances are measured from here"
            pinColor="#059669"
          />
        ) : null}

        {stations.map((s) => (
          <Marker
            // Keyed on selection too: a pin's colour is fixed when it is drawn.
            key={`${s.id}-${s.id === selectedId ? "on" : "off"}`}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={s.name}
            description={s.miles != null ? `${s.miles.toFixed(2)} mi` : undefined}
            pinColor={s.id === selectedId ? "#111827" : (s.color ?? "#dc2626")}
            zIndex={s.id === selectedId ? 10 : 1}
            onPress={(e) => {
              e.stopPropagation();
              onSelect?.(s.id);
            }}
          />
        ))}

        {picking && picked ? (
          <Marker
            coordinate={{ latitude: picked.lat, longitude: picked.lng }}
            title="Release point"
            pinColor="#dc2626"
          />
        ) : null}
      </MapView>

      {/* The portal's layer switcher, in the corner it lives in there too. */}
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
