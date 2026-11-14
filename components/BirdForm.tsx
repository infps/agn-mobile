import { SEX_OPTIONS } from "@/constants/bird";
import React from "react";
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

/**
 * The fields a bird is made of, shared by adding and editing.
 *
 * The lists are the portal's own (`src/lib/bird-constants.ts`), so a band typed
 * on a phone is spelled the same way as one typed at a desk. The payload shape
 * is what `POST /api/breeder/birds` and `PATCH /api/breeder/birds/[id]` parse:
 * name, band1..band4, color, sex, and optionally rfid and attention.
 */
export const FEDERATIONS = ["AU", "IF", "NPA", "CU", "BB", "ARPU", "IPB"];
export const COLORS = [
  "BB", "BC", "BBWF", "BBPD", "BCWF", "BCPD", "SPLA", "CHOC", "RC", "SIL",
  "RCSP", "RR", "BLK", "OPAL", "SLAT", "PENC", "WHIT", "GRIZ", "DC", "DCWF",
];

export interface BirdFormState {
  name: string;
  band1: string;
  band2: string;
  band3: string;
  band4: string;
  color: string;
  sex: string;
  rfid: string;
  attention: boolean;
}

export const emptyBirdForm = (): BirdFormState => ({
  name: "",
  band1: "AU",
  band2: String(new Date().getFullYear()),
  band3: "",
  band4: "",
  color: "BB",
  sex: "1",
  rfid: "",
  attention: false,
});

export const bandOf = (b: Pick<BirdFormState, "band1" | "band2" | "band3" | "band4">) =>
  `${b.band1}-${b.band2}-${b.band3}-${b.band4}`;

/** Returns what is wrong, or null. Every band part is required by the API. */
export function validateBirdForm(s: BirdFormState): string | null {
  if (!s.name.trim()) return "Give the bird a name.";
  if (!s.band1) return "Choose a federation.";
  if (!s.band2.trim()) return "Enter the band year.";
  if (!s.band3.trim()) return "Enter the band letters.";
  if (!s.band4.trim()) return "Enter the band number.";
  if (!s.color) return "Choose a colour.";
  return null;
}

export function birdPayload(s: BirdFormState) {
  const rfid = s.rfid.trim();
  return {
    name: s.name.trim(),
    band1: s.band1,
    band2: s.band2.trim(),
    band3: s.band3.trim().toUpperCase(),
    band4: s.band4.trim(),
    color: s.color,
    sex: parseInt(s.sex, 10) || 0,
    attention: s.attention,
    ...(rfid ? { rfid } : {}),
  };
}

function Chips({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View className="mt-3">
      <Text className="text-sm mb-1 text-gray-600">{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <TouchableOpacity
              key={o.value}
              onPress={() => onChange(o.value)}
              className={`mr-2 rounded-full border px-3 py-2 ${
                on ? "bg-primary border-primary" : "bg-white border-gray-300"
              }`}
            >
              <Text className={on ? "text-white font-semibold text-xs" : "text-gray-700 text-xs"}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const asOptions = (list: string[]) => list.map((v) => ({ value: v, label: v }));

export function BirdForm({
  value,
  onChange,
}: {
  value: BirdFormState;
  onChange: (patch: Partial<BirdFormState>) => void;
}) {
  const preview = [value.band1, value.band2, value.band3.toUpperCase(), value.band4]
    .filter(Boolean)
    .join("-");

  return (
    <View>
      <Text className="text-sm mb-1 text-gray-600">Bird Name *</Text>
      <TextInput
        className="border rounded-lg p-3 text-black border-gray-300 bg-white"
        value={value.name}
        placeholder="Enter bird name"
        placeholderTextColor="#9ca3af"
        onChangeText={(t) => onChange({ name: t })}
      />

      <Chips
        label="Federation *"
        value={value.band1}
        options={asOptions(FEDERATIONS)}
        onChange={(v) => onChange({ band1: v })}
      />

      <View className="flex-row gap-3 mt-3">
        <View className="flex-1">
          <Text className="text-sm mb-1 text-gray-600">Year *</Text>
          <TextInput
            className="border rounded-lg p-3 text-black border-gray-300 bg-white"
            keyboardType="numeric"
            value={value.band2}
            placeholder="2026"
            placeholderTextColor="#9ca3af"
            onChangeText={(t) => onChange({ band2: t.replace(/[^0-9]/g, "") })}
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm mb-1 text-gray-600">Letters *</Text>
          <TextInput
            className="border rounded-lg p-3 text-black border-gray-300 bg-white"
            autoCapitalize="characters"
            value={value.band3}
            placeholder="ABCD"
            placeholderTextColor="#9ca3af"
            onChangeText={(t) => onChange({ band3: t.toUpperCase() })}
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm mb-1 text-gray-600">Number *</Text>
          <TextInput
            className="border rounded-lg p-3 text-black border-gray-300 bg-white"
            value={value.band4}
            placeholder="12345"
            placeholderTextColor="#9ca3af"
            onChangeText={(t) => onChange({ band4: t })}
          />
        </View>
      </View>
      {preview ? (
        <Text className="mt-1 text-xs text-gray-500">Band: {preview}</Text>
      ) : null}

      <Chips
        label="Colour *"
        value={value.color}
        options={asOptions(COLORS)}
        onChange={(v) => onChange({ color: v })}
      />
      <Chips
        label="Sex *"
        value={value.sex}
        options={SEX_OPTIONS}
        onChange={(v) => onChange({ sex: v })}
      />

      <View className="mt-3">
        <Text className="text-sm mb-1 text-gray-600">RFID / chip tag</Text>
        <TextInput
          className="border rounded-lg p-3 text-black border-gray-300 bg-white"
          autoCapitalize="characters"
          autoCorrect={false}
          value={value.rfid}
          placeholder="Optional"
          placeholderTextColor="#9ca3af"
          onChangeText={(t) => onChange({ rfid: t })}
        />
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="flex-1 pr-3 text-sm text-gray-700">
          Pay attention during basketing
        </Text>
        <Switch
          value={value.attention}
          onValueChange={(v) => onChange({ attention: v })}
          trackColor={{ true: "#189AB4" }}
        />
      </View>
    </View>
  );
}

export default BirdForm;
