import React from "react";
import { Text, View } from "react-native";
import { Loading, Screen, SectionTitle } from "@/components/admin/ui";
import { Segmented } from "@/components/admin/formBits";
import { sexLabel, useDisplaySettings } from "@/components/admin/displaySettings";

/**
 * Display preferences.
 *
 * Two choices about how things are worded, not about what is stored: the unit
 * race speed is shown in, and what the two sexes are called. As in the portal
 * they are kept on the device rather than the account, so a phone and a
 * browser can each be set the way the person holding them reads.
 *
 * No permission guards this. It changes nothing on the server and nothing for
 * anybody else.
 */
export default function Settings() {
  const { velocityUnit, sexTerminology, ready, update } = useDisplaySettings();

  return (
    <Screen title="Settings" subtitle="Display preferences, saved on this device">
      {!ready ? (
        <Loading />
      ) : (
        <>
          <SectionTitle>Velocity unit</SectionTitle>
          <Text className="text-xs text-slate-500">Unit used to display race speed.</Text>
          <Segmented
            options={[
              { key: "YPM", label: "Yards / min" },
              { key: "MPM", label: "Metres / min" },
            ]}
            value={velocityUnit}
            onChange={(v) => update({ velocityUnit: v })}
          />

          <SectionTitle>Bird sex terminology</SectionTitle>
          <Text className="text-xs text-slate-500">How bird sex is labelled.</Text>
          <Segmented
            options={[
              { key: "traditional", label: "Cock ♂ / Hen ♀" },
              { key: "neutral", label: "Male ♂ / Female ♀" },
            ]}
            value={sexTerminology}
            onChange={(v) => update({ sexTerminology: v })}
          />
          <View className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <Text className="text-sm text-slate-600">
              Preview: sex 1 = {sexLabel(1, sexTerminology)} · sex 2 = {sexLabel(2, sexTerminology)}
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}
