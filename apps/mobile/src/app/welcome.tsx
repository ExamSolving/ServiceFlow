import { StyleSheet, View } from 'react-native';

import { Brand } from '@/components/brand';
import { LanguageOptions } from '@/components/preferences/language-options';
import { ThemeOptions } from '@/components/preferences/theme-options';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { usePreferences } from '@/providers/preferences-provider';

/**
 * First launch: choose a language (and theme) before anything else. The
 * screen switches language and theme as soon as an option is tapped.
 */
export default function WelcomeScreen() {
  const { t, confirmLanguage } = usePreferences();

  return (
    <Screen>
      <Brand />
      <View style={styles.heading}>
        <Text variant="eyebrow" tone="primary">
          {t('welcome.eyebrow')}
        </Text>
        <Text variant="title">{t('welcome.title')}</Text>
        <Text tone="secondary">{t('welcome.subtitle')}</Text>
      </View>
      <View style={styles.section}>
        <Text variant="label">{t('welcome.language')}</Text>
        <LanguageOptions />
      </View>
      <View style={styles.section}>
        <Text variant="label">{t('appearance.title')}</Text>
        <ThemeOptions />
      </View>
      <Button title={t('common.continue')} onPress={confirmLanguage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  section: { gap: Spacing.md },
});
