/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** The two schemes we actually have colours for. */
type Scheme = keyof typeof Colors;

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  // React Native's scheme can also be null or 'unspecified' — a device that has
  // not been told which to use. Both mean the same thing to us, and light is
  // what "no preference" has always rendered as here.
  const reported = useColorScheme();
  const theme: Scheme = reported === 'dark' ? 'dark' : 'light';

  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
