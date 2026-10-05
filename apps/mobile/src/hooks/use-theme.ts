import { Colors, type Palette } from '@/constants/theme';
import { usePreferences } from '@/providers/preferences-provider';

/** The ServiceFlow palette for the theme the technician chose (or the phone's, for "System"). */
export function useTheme(): Palette {
  return Colors[usePreferences().colorScheme];
}
