import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

/** SF Symbols on iOS, Material Symbols on Android and web. */
const ICONS = {
  brand: { ios: 'square.2.layers.3d', android: 'layers', web: 'layers' },
  show: { ios: 'eye', android: 'visibility', web: 'visibility' },
  hide: { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' },
  mail: { ios: 'envelope.badge', android: 'mark_email_read', web: 'mark_email_read' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  alert: { ios: 'exclamationmark.circle', android: 'error', web: 'error' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  success: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' },
  offline: { ios: 'wifi.exclamationmark', android: 'wifi_off', web: 'wifi_off' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  account: { ios: 'person.crop.circle.badge.exclamationmark', android: 'person_alert', web: 'person_alert' },
  blocked: { ios: 'person.crop.circle.badge.xmark', android: 'person_off', web: 'person_off' },
  jobs: { ios: 'wrench.and.screwdriver', android: 'home_repair_service', web: 'home_repair_service' },
  workspace: { ios: 'building.2', android: 'apartment', web: 'apartment' },
  badge: { ios: 'person.text.rectangle', android: 'badge', web: 'badge' },
  signOut: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  language: { ios: 'globe', android: 'language', web: 'language' },
  themeSystem: { ios: 'circle.lefthalf.filled', android: 'contrast', web: 'contrast' },
  themeLight: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' },
  themeDark: { ios: 'moon', android: 'dark_mode', web: 'dark_mode' },
  call: { ios: 'phone', android: 'call', web: 'call' },
  directions: { ios: 'map', android: 'directions', web: 'directions' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  person: { ios: 'person', android: 'person', web: 'person' },
  note: { ios: 'note.text', android: 'sticky_note_2', web: 'sticky_note_2' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  more: { ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  done: { ios: 'checkmark.seal', android: 'task_alt', web: 'task_alt' },
  send: { ios: 'paperplane', android: 'send', web: 'send' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' },
  priority: { ios: 'exclamationmark.triangle', android: 'priority_high', web: 'priority_high' },
  waiting: { ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' },
} satisfies Record<string, Exclude<SymbolViewProps['name'], string>>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function Icon({ name, color, size = 20, style }: IconProps) {
  return (
    <SymbolView
      name={ICONS[name]}
      tintColor={color}
      size={size}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
