import React, { type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import RNModal from "react-native-modal";
import { Ionicons } from "@expo/vector-icons";

/**
 * Acting on what the sections show.
 *
 * The admin sections started as dashboards, so `ui.tsx` only had to render.
 * Making them read-write needs a second, smaller vocabulary: something to
 * press, something to type into, something to pick from, and a way to stop
 * somebody mid-gesture when the action moves money or cannot be undone.
 *
 * These stay deliberately plain. An operator uses them on a phone, outdoors,
 * during an event — so targets are large, pending states are visible, and a
 * destructive choice never sits where a safe one is expected.
 *
 * Re-exported from `ui.tsx`, so a section still has one import.
 */

type ButtonTone = "primary" | "secondary" | "danger" | "success";

const BUTTON_TONES: Record<ButtonTone, { box: string; label: string; spinner: string }> = {
  primary: { box: "bg-cyan-600", label: "text-white", spinner: "#ffffff" },
  secondary: { box: "border border-slate-300 bg-white", label: "text-slate-700", spinner: "#475569" },
  danger: { box: "bg-rose-600", label: "text-white", spinner: "#ffffff" },
  success: { box: "bg-emerald-600", label: "text-white", spinner: "#ffffff" },
};

export function Button({
  label,
  onPress,
  tone = "primary",
  pending = false,
  disabled = false,
  icon,
  full = false,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  pending?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  full?: boolean;
}) {
  const style = BUTTON_TONES[tone];
  const off = disabled || pending;
  const box = [
    "flex-row items-center justify-center gap-2 rounded-lg px-4 py-2.5",
    style.box,
    off ? "opacity-50" : "",
    full ? "flex-1" : "",
  ].join(" ");

  return (
    <Pressable onPress={onPress} disabled={off} className={box}>
      {pending ? (
        <ActivityIndicator size="small" color={style.spinner} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={style.spinner} /> : null}
          <Text className={"text-sm font-medium " + style.label}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Buttons side by side, with the safe one first so a thumb lands there. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return (
    <View className="mt-3 flex-row" style={{ gap: 8 }}>
      {children}
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard = "default",
  hint,
  autoFocus = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  keyboard?: "default" | "numeric" | "decimal-pad" | "email-address";
  hint?: string | null;
  autoFocus?: boolean;
  multiline?: boolean;
}) {
  const box = [
    "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900",
    multiline ? "h-24" : "",
  ].join(" ");

  return (
    <View className="mt-3">
      <Text className="mb-1 text-xs font-medium text-slate-600">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboard}
        autoFocus={autoFocus}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
        className={box}
        style={multiline ? { textAlignVertical: "top" } : undefined}
      />
      {hint ? <Text className="mt-1 text-xs text-slate-400">{hint}</Text> : null}
    </View>
  );
}

/**
 * A sheet that slides up from the bottom, for anything needing a form or a
 * list of targets.
 *
 * Bottom rather than centre because the whole interaction is one-handed: the
 * controls arrive under the thumb instead of in the middle of the screen,
 * where the hand has to be repositioned to reach them.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) {
  return (
    <RNModal
      isVisible={open}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      swipeDirection="down"
      onSwipeComplete={onClose}
      propagateSwipe
      style={{ justifyContent: "flex-end", margin: 0 }}
    >
      <View className="max-h-[85%] rounded-t-2xl bg-white px-4 pb-8 pt-3">
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-slate-300" />
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-lg font-semibold text-slate-900">{title}</Text>
            {subtitle ? <Text className="mt-0.5 text-xs text-slate-500">{subtitle}</Text> : null}
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color="#94a3b8" />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </RNModal>
  );
}

export interface Choice {
  key: string | number;
  label: string;
  hint?: string | null;
  /** Shown greyed, with the reason in place of the hint. */
  disabled?: boolean;
  disabledReason?: string | null;
}

/**
 * A list of targets to pick one of — the move-to, assign-to, change-to shape.
 *
 * A target that cannot take the bird stays visible and greyed with its reason
 * rather than being filtered out: "the basket I want is missing" is a worse
 * thing to hand an operator than "that basket is full".
 */
export function ChoiceList({
  choices,
  onPick,
  selected,
  empty = "Nothing to choose from.",
}: {
  choices: Choice[];
  onPick: (key: string | number) => void;
  selected?: string | number | null;
  empty?: string;
}) {
  if (choices.length === 0) {
    return <Text className="py-6 text-center text-sm text-slate-500">{empty}</Text>;
  }

  return (
    <View className="mt-2 overflow-hidden rounded-xl border border-slate-200">
      {choices.map((choice, index) => {
        const off = choice.disabled === true;
        const isOn = selected != null && selected === choice.key;
        const row = [
          "flex-row items-center gap-3 px-4 py-3",
          index > 0 ? "border-t border-slate-100" : "",
          off ? "bg-slate-50" : isOn ? "bg-cyan-50" : "bg-white",
        ].join(" ");

        return (
          <Pressable key={choice.key} onPress={() => !off && onPick(choice.key)} disabled={off} className={row}>
            <View className="min-w-0 flex-1">
              <Text
                className={"text-sm font-medium " + (off ? "text-slate-400" : "text-slate-900")}
                numberOfLines={1}
              >
                {choice.label}
              </Text>
              {off && choice.disabledReason ? (
                <Text className="text-xs text-rose-400" numberOfLines={1}>
                  {choice.disabledReason}
                </Text>
              ) : choice.hint ? (
                <Text className="text-xs text-slate-500" numberOfLines={1}>
                  {choice.hint}
                </Text>
              ) : null}
            </View>
            {isOn ? <Ionicons name="checkmark" size={18} color="#0891b2" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The stop-and-think step.
 *
 * Used where the portal uses one: settling payouts, closing an auction, ending
 * a race, waiving a penalty. The consequence is spelled out rather than
 * summarised as "Are you sure?" — on a phone the confirm button sits a thumb's
 * width from where the last tap landed, so the sentence is what actually
 * protects, not the extra tap.
 */
export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  tone = "danger",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  tone?: ButtonTone;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <RNModal
      isVisible={open}
      onBackdropPress={pending ? undefined : onCancel}
      animationIn="zoomIn"
      animationOut="zoomOut"
    >
      <View className="rounded-2xl bg-white p-5">
        <Text className="text-base font-semibold text-slate-900">{title}</Text>
        <Text className="mt-2 text-sm text-slate-600">{body}</Text>
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={onCancel} disabled={pending} full />
          <Button label={confirmLabel} tone={tone} onPress={onConfirm} pending={pending} full />
        </ButtonRow>
      </View>
    </RNModal>
  );
}
