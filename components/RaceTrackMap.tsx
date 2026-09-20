import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import api from "@/service/api.service";

interface Ping {
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
}

interface Track {
  transportStatus: string | null;
  transportStartedAt: string | null;
  latest: Ping | null;
  pings: Ping[];
  station: { name: string | null; lat: number; lng: number; miles: number | null } | null;
  loft: { name: string | null; lat: number; lng: number } | null;
}

/**
 * The same three base layers the portal offers, from the same free sources.
 *
 * These URLs are lifted from `base-layers.tsx` in the portal rather than
 * reinvented, so a station looks the same on a phone as it does on the desk
 * it was placed from. None of them needs an API key.
 *
 * One difference from the portal's copy: Leaflet's `{s}` subdomain placeholder
 * is a Leaflet feature, not part of the tile URL scheme, and these tile hosts
 * all answer on their bare domain — so it is dropped rather than passed through
 * as a literal that would 404 every tile.
 */
const LAYERS = [
  {
    key: "street",
    label: "Street",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  {
    key: "terrain",
    label: "Terrain",
    url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
  },
  {
    key: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
] as const;

/** OpenTopoMap caps at 17; the portal keeps every layer there so switching never re-clamps. */
const MAP_MAX_ZOOM = 17;

/**
 * Where the transport is, on the way to the liberation point.
 *
 * The portal draws this with Leaflet over OpenStreetMap, OpenTopoMap and Esri
 * imagery — all free, no key, no billing. This draws the same data over the
 * same three tile sources, so the two are the same map rather than two maps
 * that happen to show the same coordinates.
 *
 * `mapType="none"` matters: it stops the platform drawing its own base map
 * underneath, so what you see is the portal's imagery and nothing else. Without
 * it the tiles would be layered over Apple or Google's, which is both wasteful
 * and visibly wrong at the seams.
 *
 * It follows the convoy rather than holding a fixed frame: the question being
 * asked is "where are they now", and a map that has to be panned to answer it
 * is a map somebody puts down. The route stays drawn behind the marker because
 * the shape of the trip is how you tell a stop from a detour.
 */
export function RaceTrackMap({
  raceId,
  height = 260,
  /** Off once the race is in the air; the transport is no longer the story. */
  live = true,
}: {
  raceId: number;
  height?: number;
  live?: boolean;
}) {
  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<(typeof LAYERS)[number]["key"]>("street");
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await api.get(`/public/race/${raceId}/track`);
        if (!cancelled) setTrack(data ?? null);
      } catch {
        if (!cancelled) setTrack(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    if (!live) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [raceId, live]);

  const route = useMemo(
    () => (track?.pings ?? []).map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [track]
  );

  // Everything worth keeping in frame: the convoy, where it started, where it
  // is going.
  const points = useMemo(() => {
    const all = [...route];
    if (track?.station) all.push({ latitude: track.station.lat, longitude: track.station.lng });
    if (track?.loft) all.push({ latitude: track.loft.lat, longitude: track.loft.lng });
    return all;
  }, [route, track]);

  useEffect(() => {
    if (points.length === 0 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [points]);

  if (loading) {
    return (
      <View
        className="items-center justify-center rounded-xl border border-slate-200 bg-slate-50"
        style={{ height }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  // Nothing to draw means no coordinates anywhere — not merely no pings. A
  // race with a liberation point still has a map before it has ever moved, so
  // the message names what is actually missing rather than blaming the
  // tracker.
  if (!track || points.length === 0) {
    return (
      <View
        className="items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6"
        style={{ height }}
      >
        <Text className="text-center text-sm text-slate-500">
          There is nothing to map yet. Give the liberation point coordinates on the Stations
          screen and it will show here.
        </Text>
      </View>
    );
  }

  const first = points[0];
  const active = LAYERS.find((l) => l.key === layer) ?? LAYERS[0];

  return (
    <View className="overflow-hidden rounded-xl border border-slate-200" style={{ height }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        mapType="none"
        maxZoomLevel={MAP_MAX_ZOOM}
        initialRegion={{
          latitude: first.latitude,
          longitude: first.longitude,
          latitudeDelta: 2,
          longitudeDelta: 2,
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

        {route.length > 1 ? (
          <Polyline coordinates={route} strokeColor="#0891b2" strokeWidth={3} />
        ) : null}

        {track.loft ? (
          <Marker
            coordinate={{ latitude: track.loft.lat, longitude: track.loft.lng }}
            title={track.loft.name ?? "Loft"}
            description="Home"
            pinColor="#059669"
          />
        ) : null}

        {track.station ? (
          <Marker
            coordinate={{ latitude: track.station.lat, longitude: track.station.lng }}
            title={track.station.name ?? "Liberation point"}
            description={
              track.station.miles != null ? `${Math.round(track.station.miles)} mi` : undefined
            }
            pinColor="#dc2626"
          />
        ) : null}

        {track.latest ? (
          <Marker
            coordinate={{ latitude: track.latest.lat, longitude: track.latest.lng }}
            title="Transport"
            description={
              track.latest.speed != null
                ? `${Math.round(track.latest.speed)} mph · ${new Date(
                    track.latest.recordedAt
                  ).toLocaleTimeString()}`
                : new Date(track.latest.recordedAt).toLocaleTimeString()
            }
            pinColor="#2563eb"
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
