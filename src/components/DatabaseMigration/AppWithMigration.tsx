import React, {useEffect} from 'react';
import {View, StyleSheet, InteractionManager} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DatabaseMigration} from './DatabaseMigration';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {recordPhase, recordError} from '../../utils/diagnostics';
import {CURRENT_COMPLETION_SETTINGS_VERSION} from '../../utils/completionSettingsVersions';

// v1.36.0: remembers which settings-schema version the bulk migration last
// ran for. The migration is idempotent and only matters when
// CURRENT_COMPLETION_SETTINGS_VERSION changes — previously it rescanned and
// JSON.parsed the ENTIRE completion_settings + global_settings tables on
// every single launch, landing ~2s after the chat appeared (the classic
// first-interaction jank window). A failed run doesn't record the key, so
// the next launch retries; per-read lazy migration (CompletionSetting
// .getSettings()) keeps everything correct in the meantime.
const APPLIED_SETTINGS_VERSION_KEY = 'settings.migration.appliedVersion';

/**
 * Wraps the main app component and displays the migration UI when needed.
 */
export const AppWithMigration: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  useEffect(() => {
    const migrateSettings = async () => {
      try {
        const applied = await AsyncStorage.getItem(
          APPLIED_SETTINGS_VERSION_KEY,
        );
        if (applied === String(CURRENT_COMPLETION_SETTINGS_VERSION)) {
          return;
        }

        // Let the first interactions settle before scanning the tables.
        await InteractionManager.runAfterInteractions();

        recordPhase('startup:settings-migration-started');
        // Migrate all settings to the latest version
        await chatSessionRepository.migrateAllSettings();
        await AsyncStorage.setItem(
          APPLIED_SETTINGS_VERSION_KEY,
          String(CURRENT_COMPLETION_SETTINGS_VERSION),
        );
        recordPhase('startup:settings-migration-done');
      } catch (error) {
        recordError(error, 'settings-migration');
        console.error('Failed to migrate settings:', error);
      }
    };

    migrateSettings();
  }, []);

  return (
    <View style={styles.container}>
      {children}
      <DatabaseMigration />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
