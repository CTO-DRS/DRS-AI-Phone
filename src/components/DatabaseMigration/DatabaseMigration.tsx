import React, {useContext, useEffect, useMemo, useRef} from 'react';
import {ActivityIndicator, Alert, StyleSheet, Text, View} from 'react-native';
import Share from 'react-native-share';
import {Button} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {
  MIGRATION_HEARTBEAT_TIMEOUT_MS,
  MIGRATION_TOTAL_TIMEOUT_MS,
  chatSessionStore,
} from '../../store/ChatSessionStore';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {buildDiagnosticsReport, getEvents} from '../../utils/diagnostics';
import {t} from '../../locales';
import type {Theme} from '../../utils/types';

// How often the watchdog re-checks for liveness while migrating.
const WATCHDOG_TICK_MS = 5_000;

/**
 * Full-screen overlay shown while the one-time JSON → WatermelonDB
 * migration runs (v1.34.0 redesign).
 *
 * Two states:
 * 1. Migrating: spinner + live progress ("session 3 of 25"). A watchdog
 *    ticks every WATCHDOG_TICK_MS; if no progress heartbeat arrives within
 *    MIGRATION_HEARTBEAT_TIMEOUT_MS (or the attempt exceeds the absolute
 *    MIGRATION_TOTAL_TIMEOUT_MS ceiling), the store is marked stalled.
 * 2. Recovery: explicit error state with Retry / Reset app data / Share
 *    diagnostics. The UI can never sit on an eternal spinner — the exact
 *    failure mode users reported between v1.30 and v1.33.
 */
export const DatabaseMigration = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    isMigrating,
    migrationError,
    migrationStalled,
    migrationProgress,
    isResettingData,
    resetFailed,
  } = chatSessionStore;

  // Watchdog: track the last observed progress heartbeat while the
  // spinner is up, and flip to the recovery state when it goes stale.
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    if (migrationProgress) {
      lastActivityRef.current = Date.now();
    }
  }, [migrationProgress]);

  useEffect(() => {
    if (!isMigrating || migrationError || migrationStalled) {
      return;
    }
    const startedAt = Date.now();
    lastActivityRef.current = Date.now();
    const timer = setInterval(() => {
      if (chatSessionStore.isResettingData) {
        // The destructive reset enforces its own timeouts in the store;
        // do not let the migration watchdog interfere with it.
        lastActivityRef.current = Date.now();
        return;
      }
      const now = Date.now();
      if (
        now - lastActivityRef.current > MIGRATION_HEARTBEAT_TIMEOUT_MS ||
        now - startedAt > MIGRATION_TOTAL_TIMEOUT_MS
      ) {
        chatSessionStore.markMigrationStalled();
      }
    }, WATCHDOG_TICK_MS);
    return () => clearInterval(timer);
  }, [isMigrating, migrationError, migrationStalled]);

  const handleRetry = () => {
    chatSessionStore.retryMigration();
  };

  const handleReset = () => {
    Alert.alert(
      l10n.errors.dbRecovery.resetConfirmTitle,
      l10n.errors.dbRecovery.resetConfirmBody,
      [
        {text: l10n.errors.dbRecovery.cancel, style: 'cancel'},
        {
          text: l10n.errors.dbRecovery.reset,
          style: 'destructive',
          onPress: () => {
            chatSessionStore.resetAppData().catch(() => undefined);
          },
        },
      ],
    );
  };

  const handleShare = async () => {
    // The report includes the startup timeline (exact stall phase), the
    // previous session, captured errors, native crash files, and the
    // app's own logcat tail.
    const text = await buildDiagnosticsReport();
    await Share.open({
      title: l10n.diagnostics.title,
      message: text,
      failOnCancel: false,
    });
  };

  if (!isMigrating) {
    return null;
  }

  const inRecovery = Boolean(migrationError || migrationStalled);
  const events = getEvents();
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  return (
    <View style={styles.container} testID="database-migration-overlay">
      {!inRecovery ? (
        <>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.text}>{l10n.errors.dbUpgrade.title}</Text>
          {migrationProgress ? (
            <Text style={styles.subText}>
              {t(l10n.errors.dbUpgrade.progress, {
                done: migrationProgress.done,
                total: migrationProgress.total,
              })}
            </Text>
          ) : null}
          <Text style={styles.subText}>{l10n.errors.dbUpgrade.subTitle}</Text>
        </>
      ) : (
        <>
          <Text style={styles.errorTitle}>{l10n.errors.dbRecovery.title}</Text>
          <Text style={styles.subText}>{l10n.errors.dbRecovery.body}</Text>
          {lastEvent ? (
            <Text style={styles.lastPhase}>
              {`${l10n.errors.dbRecovery.lastPhase}: ${lastEvent.msg}`}
            </Text>
          ) : null}
          {resetFailed ? (
            <Text style={styles.hint}>
              {l10n.errors.dbRecovery.resetFailedHint}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={handleRetry}
              disabled={isResettingData}
              style={styles.button}
              testID="db-recovery-retry">
              {l10n.errors.dbRecovery.retry}
            </Button>
            <Button
              mode="outlined"
              onPress={handleReset}
              disabled={isResettingData}
              textColor={theme.colors.error}
              style={styles.button}
              testID="db-recovery-reset">
              {isResettingData
                ? l10n.errors.dbRecovery.resetting
                : l10n.errors.dbRecovery.reset}
            </Button>
            <Button
              mode="text"
              onPress={() => {
                handleShare().catch(() => undefined);
              }}
              style={styles.button}
              testID="db-recovery-share">
              {l10n.errors.dbRecovery.shareDiagnostics}
            </Button>
          </View>
        </>
      )}
    </View>
  );
});

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 24,
    },
    text: {
      fontSize: 18,
      fontWeight: 'bold',
      marginTop: 16,
      color: theme.colors.onBackground,
      textAlign: 'center',
    },
    subText: {
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
      paddingHorizontal: 32,
      color: theme.colors.onBackground,
      opacity: 0.8,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.error,
      textAlign: 'center',
    },
    lastPhase: {
      fontSize: 12,
      marginTop: 12,
      textAlign: 'center',
      paddingHorizontal: 16,
      color: theme.colors.onBackground,
      opacity: 0.6,
    },
    hint: {
      fontSize: 13,
      marginTop: 12,
      textAlign: 'center',
      paddingHorizontal: 16,
      color: theme.colors.error,
    },
    actions: {
      marginTop: 24,
      alignItems: 'center',
      gap: 8,
      alignSelf: 'stretch',
    },
    button: {
      alignSelf: 'stretch',
    },
  });
