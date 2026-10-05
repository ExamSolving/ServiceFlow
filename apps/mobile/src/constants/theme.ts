/**
 * ServiceFlow colours, matching the web admin (apps/web/src/app/globals.css).
 * The light palette uses the web's tokens; the dark palette is a green-tinted
 * equivalent with the same roles.
 */
export const Colors = {
  light: {
    background: '#fcfcf9',
    card: '#ffffff',
    text: '#172e29',
    textSecondary: '#687772',
    primary: '#176c58',
    primaryPressed: '#125746',
    primaryText: '#ffffff',
    secondary: '#eaf1e5',
    secondaryText: '#375f4c',
    muted: '#f0f4ec',
    border: '#dce3de',
    ring: '#4f9782',
    danger: '#bb3434',
    dangerSurface: '#fbf1f1',
    dangerBorder: '#f1d6d6',
    infoSurface: '#e8f0ee',
    infoBorder: '#d1e2de',
  },
  dark: {
    background: '#0f1a17',
    card: '#15241f',
    text: '#e7f0ec',
    textSecondary: '#9cb0a8',
    primary: '#4fb394',
    primaryPressed: '#3f9a7e',
    primaryText: '#0b1512',
    secondary: '#1d342c',
    secondaryText: '#b4d9ca',
    muted: '#182a24',
    border: '#26392f',
    ring: '#4f9782',
    danger: '#f08a8a',
    dangerSurface: '#2a1717',
    dangerBorder: '#4a2424',
    infoSurface: '#16302a',
    infoBorder: '#24463b',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 6, md: 10, lg: 14, full: 999 } as const;
export const MaxContentWidth = 560;
