import React, {useContext, useEffect, useState} from 'react';
import {Modal, ScrollView, TouchableOpacity, View} from 'react-native';
import {Text, useTheme} from 'react-native-paper';
import {observer} from 'mobx-react';

import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {computeChatStats, type ChatStats} from '../../utils/chatStats';
import {userId} from '../../utils/chat';
import {CloseIcon} from '../../assets/icons';

interface ChatStatsModalProps {
  visible: boolean;
  onClose: () => void;
  /** Omitted → aggregate statistics over every stored session. */
  sessionId?: string | null;
}

const formatDateTime = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
};

/**
 * Conversation statistics dialog: message/word counts and the most frequent
 * topics, for one session or aggregated over all of them.
 */
export const ChatStatsModal: React.FC<ChatStatsModalProps> = observer(
  ({visible, onClose, sessionId}) => {
    const [stats, setStats] = useState<ChatStats | null>(null);
    const [sessionCount, setSessionCount] = useState(0);
    const [failed, setFailed] = useState(false);
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const s = l10n.components.chatStats;

    useEffect(() => {
      if (!visible) {
        return;
      }
      let cancelled = false;
      const load = async () => {
        setStats(null);
        setFailed(false);
        try {
          if (sessionId) {
            const sessionData =
              await chatSessionRepository.getSessionById(sessionId);
            if (cancelled) {
              return;
            }
            if (!sessionData) {
              setFailed(true);
              return;
            }
            setStats(
              computeChatStats(
                sessionData.messages.map(m => m.toMessageObject()),
                userId,
              ),
            );
          } else {
            const [sessions, messages] = await Promise.all([
              chatSessionRepository.getAllSessions(),
              chatSessionRepository.getAllMessages(),
            ]);
            if (cancelled) {
              return;
            }
            setSessionCount(sessions.length);
            setStats(
              computeChatStats(
                messages.map(m => m.toMessageObject()),
                userId,
              ),
            );
          }
        } catch (error) {
          console.error('Failed to compute chat stats:', error);
          if (!cancelled) {
            setFailed(true);
          }
        }
      };
      load();
      return () => {
        cancelled = true;
      };
    }, [visible, sessionId]);

    const rows: Array<{label: string; value: string | number}> = stats
      ? [
          ...(sessionId ? [] : [{label: s.sessions, value: sessionCount}]),
          {label: s.totalMessages, value: stats.totalMessages},
          {label: s.userMessages, value: stats.userMessages},
          {label: s.assistantMessages, value: stats.assistantMessages},
          {label: s.totalWords, value: stats.totalWords},
          {label: s.userWords, value: stats.userWords},
          {label: s.assistantWords, value: stats.assistantWords},
          {label: s.totalChars, value: stats.totalChars},
          {label: s.firstActivity, value: formatDateTime(stats.firstActivity)},
          {label: s.lastActivity, value: formatDateTime(stats.lastActivity)},
        ]
      : [];

    return (
      <Modal
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
        animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} testID="chat-stats-modal">
            <View style={styles.titleRow}>
              <Text style={styles.modalTitle}>
                {sessionId ? s.sessionTitle : s.globalTitle}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                testID="chat-stats-close"
                accessibilityRole="button"
                accessibilityLabel={l10n.common.close}>
                <CloseIcon
                  stroke={theme.colors.onSurfaceVariant}
                  width={18}
                  height={18}
                />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}>
              {failed && <Text style={styles.hint}>{s.loadError}</Text>}
              {!failed && !stats && (
                <Text style={styles.hint} testID="chat-stats-loading">
                  …
                </Text>
              )}
              {!failed && stats && (
                <>
                  {stats.totalMessages === 0 && (
                    <Text style={styles.hint}>{s.emptySession}</Text>
                  )}
                  <View style={styles.statsList}>
                    {rows.map(row => (
                      <View style={styles.statRow} key={row.label}>
                        <Text style={styles.statLabel}>{row.label}</Text>
                        <Text style={styles.statValue}>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={[styles.label, styles.topicsTitle]}>
                    {s.topTopics}
                  </Text>
                  {stats.topTopics.length === 0 ? (
                    <Text style={styles.hint}>{s.noTopics}</Text>
                  ) : (
                    <View style={styles.chipWrap} testID="chat-stats-topics">
                      {stats.topTopics.map(topic => (
                        <View key={topic.topic} style={styles.chip}>
                          <Text style={styles.chipText}>
                            {topic.topic} · {topic.count}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  },
);
