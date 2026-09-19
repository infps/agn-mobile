import { useWindowDimensions } from "react-native";

/**
 * Screen-size awareness, so the same code runs on a phone and a tablet.
 *
 * The breakpoints are deliberately about *layout capacity* rather than device
 * names: what matters is whether there is room for a second column, not whether
 * the hardware is called a tablet. A phone held in landscape gets the wider
 * layout for the same reason a small tablet does.
 */
export const BREAKPOINTS = {
  /** Below this, one column and nothing else fits. */
  compact: 600,
  /** Room for a sidebar plus content. */
  wide: 900,
} as const;

export interface Responsive {
  width: number;
  height: number;
  isLandscape: boolean;
  /** Phone in portrait: a single column. */
  isCompact: boolean;
  /** Small tablet, or a phone turned sideways: two columns. */
  isMedium: boolean;
  /** Full tablet: persistent navigation beside the content. */
  isWide: boolean;
  /** How many cards fit across comfortably. */
  columns: number;
  /** Padding that grows with the screen instead of looking lost on a tablet. */
  gutter: number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  const isWide = width >= BREAKPOINTS.wide;
  const isMedium = width >= BREAKPOINTS.compact && width < BREAKPOINTS.wide;
  const isCompact = width < BREAKPOINTS.compact;

  return {
    width,
    height,
    isLandscape: width > height,
    isCompact,
    isMedium,
    isWide,
    columns: isWide ? 3 : isMedium ? 2 : 1,
    gutter: isWide ? 24 : isMedium ? 20 : 16,
  };
}
