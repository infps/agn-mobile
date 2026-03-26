export const SEX_VALUES = { UNKNOWN: 0, COCK: 1, HEN: 2 } as const;

export const SEX_LABELS: Record<number, string> = {
  [SEX_VALUES.UNKNOWN]: "Unknown",
  [SEX_VALUES.COCK]: "Cock",
  [SEX_VALUES.HEN]: "Hen",
};

// String values for Dropdown component compatibility
export const SEX_OPTIONS = [
  { value: String(SEX_VALUES.UNKNOWN), label: SEX_LABELS[SEX_VALUES.UNKNOWN] },
  { value: String(SEX_VALUES.COCK), label: SEX_LABELS[SEX_VALUES.COCK] },
  { value: String(SEX_VALUES.HEN), label: SEX_LABELS[SEX_VALUES.HEN] },
];

export const getSexLabel = (sex: number | null | undefined): string =>
  SEX_LABELS[sex ?? SEX_VALUES.UNKNOWN] ?? "Unknown";
