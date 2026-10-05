import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { PreferencesProvider, usePreferences } from '@/providers/preferences-provider';

// Keep the splash screen up until we know the language and whether someone is signed in.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

/**
 * One group of screens per state. A language must be chosen first; after
 * that, each sign-in state can only reach its own screens. When the state
 * changes, Expo Router moves the technician to the first screen they may see.
 */
function RootNavigator() {
  const { ready, languageConfirmed, colorScheme } = usePreferences();
  const { status } = useAuth().state;
  const chosen = ready && languageConfirmed;

  useEffect(() => {
    if (ready && (!languageConfirmed || status !== 'loading')) void SplashScreen.hideAsync();
  }, [ready, languageConfirmed, status]);

  const palette = Colors[colorScheme];
  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.card,
      text: palette.text,
      border: palette.border,
      notification: palette.danger,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={ready && !languageConfirmed}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={chosen && status === 'ready'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!ready || (chosen && (status === 'signedOut' || status === 'loading'))}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
        <Stack.Protected guard={chosen && status === 'unverified'}>
          <Stack.Screen name="verify-email" />
        </Stack.Protected>
        <Stack.Protected guard={chosen && (status === 'blocked' || status === 'error' || status === 'misconfigured')}>
          <Stack.Screen name="account-status" />
        </Stack.Protected>
        <Stack.Protected guard={chosen}>
          <Stack.Screen name="settings" />
        </Stack.Protected>
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
