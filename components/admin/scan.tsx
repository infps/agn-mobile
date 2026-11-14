import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";

/**
 * What every scanning screen in the loft shares.
 *
 * Groups, baskets and check-in all end up doing the same thing with their
 * hands: a tag is read, something is asked of the server, the next tag is
 * read. The portal has three ways for the tag to arrive — a network reader it
 * polls, a USB reader over Web Serial, and typing. A phone has two of those: a
 * wedge scanner (which is just a keyboard, so the field below handles it) and
 * the same network poll the portal uses.
 *
 * Web Serial has no equivalent here and is not pretended at.
 */

/** The portal's short form of a band: AU-2024-ABCD-1234 with the club trimmed. */
export function shortBand(band: string | null | undefined): string {
  if (!band) return "";
  const parts = band.split("-");
  if (parts.length < 4) return band;
  const letters = parts.slice(2, -1).join("-").slice(0, 4);
  return [parts[0], parts[1], letters, parts[parts.length - 1]].join("-");
}

/** A band from its four parts when they exist, the stored string when not. */
export function bandOf(
  bird:
    | {
        band?: string | null;
        band1?: string | null;
        band2?: string | null;
        band3?: string | null;
        band4?: string | null;
      }
    | null
    | undefined
): string {
  if (!bird) return "";
  return (
    [bird.band1, bird.band2, bird.band3, bird.band4].filter(Boolean).join("-") || bird.band || ""
  );
}

export function personName(
  p: { firstName?: string | null; lastName?: string | null } | null | undefined
): string {
  return p ? [p.firstName, p.lastName].filter(Boolean).join(" ") : "";
}

export function sexLabel(sex: number | string | null | undefined): string {
  return sex === 1 ? "Cock" : sex === 2 ? "Hen" : "";
}

/**
 * The portal's network reader, polled.
 *
 * `/scanner/poll` hands back reads pushed by a reader on the same network
 * address as whoever is asking — that is how the server knows which reader is
 * "yours". So this only produces anything when the phone is on the loft's
 * network alongside the reader. On mobile data it will simply stay quiet, which
 * is why it is something an operator switches on rather than a default.
 *
 * Only the newest read of each poll is taken and a tag is never handed over
 * twice in a row, exactly as the portal does it: a reader holding a tag in its
 * field repeats itself, and each repeat must not become another move.
 */
export function useReaderPoll(onRead: (rfid: string) => void, intervalMs = 2000) {
  const [listening, setListening] = useState(false);
  const startedAt = useRef<string | null>(null);
  const last = useRef<string | null>(null);
  const handler = useRef(onRead);
  handler.current = onRead;

  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(async () => {
      try {
        const { data } = await api.post("/scanner/poll", { startedAt: startedAt.current });
        const rfid = Array.isArray(data) && data.length > 0 ? data[0]?.el : null;
        if (rfid && rfid !== last.current) {
          last.current = rfid;
          handler.current(String(rfid));
        }
      } catch {
        // A missed poll is not worth a toast every two seconds; the next one
        // will say the same thing or succeed.
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [listening, intervalMs]);

  const start = useCallback(() => {
    last.current = null;
    startedAt.current = new Date().toISOString();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    last.current = null;
    setListening(false);
  }, []);

  return { listening, start, stop };
}

/**
 * The field a tag lands in.
 *
 * It keeps focus and clears itself after every read so a wedge scanner can
 * work down a basket without anyone touching the screen. The network reader is
 * offered underneath as a switch, off until asked for.
 */
export function ScanField({
  onRead,
  pending = false,
  placeholder = "Hold the scanner over a tag",
  poll = true,
  disabled = false,
}: {
  onRead: (rfid: string) => void;
  pending?: boolean;
  placeholder?: string;
  /** Offer the network reader as well as the typed field. */
  poll?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<TextInput>(null);
  const reader = useReaderPoll(onRead);

  const submit = () => {
    const tag = value.trim();
    if (!tag || pending || disabled) return;
    setValue("");
    onRead(tag);
    ref.current?.focus();
  };

  const off = pending || disabled || value.trim().length === 0;

  return (
    <View>
      <View className="flex-row items-center gap-2 rounded-xl border-2 border-cyan-600 bg-white px-3">
        <Ionicons name="scan-outline" size={18} color="#0891b2" />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          editable={!disabled}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          className="flex-1 py-3 text-base text-slate-900"
        />
        <Pressable
          onPress={submit}
          disabled={off}
          className={`rounded-lg px-3 py-1.5 ${off ? "bg-slate-200" : "bg-cyan-600"}`}
        >
          {pending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-sm font-medium text-white">Enter</Text>
          )}
        </Pressable>
      </View>

      {poll ? (
        <Pressable
          onPress={reader.listening ? reader.stop : reader.start}
          disabled={disabled}
          className={`mt-2 flex-row items-center gap-2 rounded-lg border px-3 py-2 ${
            reader.listening ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
          }`}
        >
          <Ionicons
            name={reader.listening ? "radio" : "radio-outline"}
            size={15}
            color={reader.listening ? "#059669" : "#64748b"}
          />
          <Text
            className={`flex-1 text-xs ${reader.listening ? "text-emerald-800" : "text-slate-600"}`}
          >
            {reader.listening
              ? "Listening to the network reader — hold a tag to it"
              : "Start the network reader (same network as the reader only)"}
          </Text>
          <Text
            className={`text-xs font-medium ${reader.listening ? "text-rose-600" : "text-cyan-700"}`}
          >
            {reader.listening ? "Stop" : "Start"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A small coloured label, for statuses that are not worth a whole row. */
export function Pill({ label, tone = "slate" }: { label: string; tone?: PillTone }) {
  const t = PILL_TONES[tone];
  return (
    <View className={`rounded-full px-2 py-0.5 ${t.bg}`}>
      <Text className={`text-[10px] font-medium ${t.text}`}>{label}</Text>
    </View>
  );
}

export type PillTone = "slate" | "green" | "amber" | "rose" | "blue" | "purple" | "cyan";

const PILL_TONES: Record<PillTone, { bg: string; text: string }> = {
  slate: { bg: "bg-slate-100", text: "text-slate-600" },
  green: { bg: "bg-emerald-100", text: "text-emerald-700" },
  amber: { bg: "bg-amber-100", text: "text-amber-700" },
  rose: { bg: "bg-rose-100", text: "text-rose-700" },
  blue: { bg: "bg-blue-100", text: "text-blue-700" },
  purple: { bg: "bg-purple-100", text: "text-purple-700" },
  cyan: { bg: "bg-cyan-100", text: "text-cyan-700" },
};

/** The small grey heading used between blocks inside a card or sheet. */
export function Caption({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </Text>
  );
}

/** Two or three options side by side — the phase and view switches. */
export function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            className={`flex-1 rounded-lg py-2 ${active ? "bg-blue-600" : ""}`}
          >
            <Text
              className={`text-center text-sm font-medium ${
                active ? "text-white" : "text-slate-600"
              }`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
