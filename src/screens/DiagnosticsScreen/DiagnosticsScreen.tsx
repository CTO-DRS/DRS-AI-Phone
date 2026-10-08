import React, {useCallback, useContext, useEffect, useState} from 'react';
import {ScrollView, View} from 'react-native';

import Clipboard from '@react-native-clipboard/clipboard';
import Share from 'react-native-share';
import {Button, Card, Text} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {
  buildDiagnosticsReport,
  clearEvents,
  getEvents,
  getPreviousSession,
  type DiagEvent,
} from '../../utils/diagnostics';

export const DiagnosticsScreen: React.FC = () => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const [report, setReport] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly DiagEvent[]>([]);
  const [previous, setPrevious] = useState<readonly DiagEvent[]>([]);
  const [building, setBuilding] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setBuilding(true);
    try {
      // Rebuild the report (includes native snapshot + logcat tail).
      const built = await buildDiagnosticsReport();
      setReport(built);
      setEvents(getEvents());
      setPrevious(getPreviousSession());
    } catch {
      // Report building is best effort; show what we have.
    } finally {
      setBuilding(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const handleCopy = useCallback(() => {
    if (!report) {
      return;
    }
    Clipboard.setString(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  const handleShare = useCallback(async () => {
    try {
      const text = report ?? (await buildDiagnosticsReport());
      await Share.open({
        title: l10n.diagnostics.title,
        message: text,
        failOnCancel: false,
      });
    } catch {
      // User cancelled or share sheet unavailable.
    }
  }, [report, l10n.diagnostics.title]);

  const handleClear = useCallback(() => {
    clearEvents();
    setEvents([]);
    setPrevious([]);
    refresh().catch(() => undefined);
  }, [refresh]);

  const renderEvents = (list: readonly DiagEvent[]) => {
    if (list.length === 0) {
      return <Text style={styles.empty}>{l10n.diagnostics.noErrors}</Text>;
    }
    return list
      .slice()
      .reverse()
      .map((e, index) => (
        <View key={`${e.ts}-${index}`} style={styles.eventRow}>
          <Text style={styles.eventTime}>{`${e.ts}  [${e.kind}]`}</Text>
          <Text style={styles.eventMsg}>{e.msg}</Text>
          {e.detail ? <Text style={styles.eventDetail}>{e.detail}</Text> : null}
        </View>
      ));
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.description}>{l10n.diagnostics.description}</Text>

        <View style={styles.actions}>
          <Button
            mode="contained"
            icon="share-variant"
            onPress={() => {
              handleShare().catch(() => undefined);
            }}
            loading={building}
            disabled={building}
            style={styles.button}
            testID="diagnostics-share">
            {l10n.diagnostics.share}
          </Button>
          <Button
            mode="outlined"
            icon="content-copy"
            onPress={handleCopy}
            disabled={!report}
            style={styles.button}
            testID="diagnostics-copy">
            {copied ? l10n.diagnostics.copied : l10n.diagnostics.copy}
          </Button>
        </View>
        <View style={styles.actions}>
          <Button
            mode="text"
            icon="refresh"
            onPress={() => {
              refresh().catch(() => undefined);
            }}
            disabled={building}
            style={styles.button}
            testID="diagnostics-refresh">
            {l10n.diagnostics.refresh}
          </Button>
          <Button
            mode="text"
            icon="delete-outline"
            onPress={handleClear}
            style={styles.button}
            testID="diagnostics-clear">
            {l10n.diagnostics.clear}
          </Button>
        </View>

        {report ? (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.reportText}>{report}</Text>
            </Card.Content>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Card.Title title={l10n.diagnostics.sectionStartup} />
          <Card.Content>
            {events.length > 0 ? (
              renderEvents(events)
            ) : (
              <Text style={styles.empty}>{l10n.diagnostics.noErrors}</Text>
            )}
          </Card.Content>
        </Card>

        {previous.length > 0 ? (
          <Card style={styles.card}>
            <Card.Title title={l10n.diagnostics.sectionPrevious} />
            <Card.Content>{renderEvents(previous)}</Card.Content>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Card.Title title={l10n.diagnostics.sectionErrors} />
          <Card.Content>
            {(() => {
              const errorEvents = events.filter(
                e => e.kind === 'error' || e.kind === 'crash',
              );
              return errorEvents.length > 0 ? (
                renderEvents(errorEvents)
              ) : (
                <Text style={styles.empty}>{l10n.diagnostics.noErrors}</Text>
              );
            })()}
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};
