import React from "react";
import { Pressable, Text, View } from "react-native";

export interface ChipOption<T extends string> {
  key: T;
  label: string;
}

/**
 * One choice out of a handful, all visible at once.
 *
 * The portal uses a dropdown for these — role, status, payment state. On a
 * phone a dropdown is two taps and a modal to pick from three things, so the
 * options are laid out flat instead: every choice is readable before anything
 * is pressed, and picking one is a single tap.
 *
 * Only for short lists. Anything long enough to scroll wants a `ChoiceList`.
 */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View className="mt-3">
      {label ? <Text className="mb-1 text-xs font-medium text-slate-600">{label}</Text> : null}
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              className={
                "rounded-full border px-3 py-1.5 " +
                (on ? "border-cyan-600 bg-cyan-600" : "border-slate-200 bg-white")
              }
            >
              <Text className={"text-xs font-medium " + (on ? "text-white" : "text-slate-600")}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
