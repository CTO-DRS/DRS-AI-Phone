import React, {useContext} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ViewStyle,
} from 'react-native';
import {observer} from 'mobx-react-lite';
import LinearGradient from 'react-native-linear-gradient';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {modelStore, modelHubStore} from '../../../store';
import {downloadManager} from '../../../services/downloads';
import {formatBytes} from '../../../utils';
import {
  extractFamilyLabel,
  extractQuantLabel,
} from '../../../utils/modelTaxonomy';

import {Sheet} from '../../../components';

interface DownloadsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Download manager: active (with live progress, pause, cancel), paused
 * (resume), verifying (post-download integrity gate), and recently
 * completed models. Failed downloads surface through the app-wide error
 * dialog/snackbar system with retry actions.
 */
export const DownloadsSheet: React.FC<DownloadsSheetProps> = observer(
  ({visible, onClose}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const t = (l10n as any).modelsHub ?? {};
    const activeJobs = downloadManager.activeJobs;
    const pausedJobs = downloadManager.pausedJobs;
    const verifyingIds = modelStore.verifyingModelIds;
    const recentlyCompleted = modelStore.models
      .filter(m => m.isDownloaded && m.downloadedAt)
      .sort((a, b) => (b.downloadedAt ?? 0) - (a.downloadedAt ?? 0))
      .slice(0, 8);

    const empty =
      activeJobs.length === 0 &&
      pausedJobs.length === 0 &&
      verifyingIds.length === 0 &&
      recentlyCompleted.length === 0;

    const emptyTitleStyle = {
      ...theme.typography.titleS,
      color: theme.colors.onSurface,
    };
    const emptyHintStyle = {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
    };
    const completedTitleStyle = {
      ...theme.typography.uiS,
      color: theme.colors.onSurface,
    };
    const completedMetaStyle = {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    };

    return (
      <Sheet
        isVisible={visible}
        snapPoints={['80%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={onClose}
        showCloseButton>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {empty && (
            <View style={styles.emptyContainer}>
              <Text style={[emptyTitleStyle, styles.textBold]}>
                {t.downloads?.emptyTitle}
              </Text>
              <Text style={[emptyHintStyle, styles.emptyHint]}>
                {t.downloads?.emptyHint}
              </Text>
            </View>
          )}

          {/* Active */}
          {activeJobs.length > 0 && (
            <Section title={t.downloads?.active ?? ''}>
              {activeJobs.map(job => {
                const p = job.state.progress;
                const pct = p
                  ? Math.floor(p.progress)
                  : job.model.progress || 0;
                return (
                  <JobCard
                    key={job.model.id}
                    theme={theme}
                    title={extractFamilyLabel(job.model.repo ?? job.model.name)}
                    subtitle={job.model.filename}
                    progress={pct}
                    detail={[
                      p
                        ? `${formatBytes(p.bytesDownloaded)} / ${formatBytes(p.bytesTotal)}`
                        : null,
                      p?.rawSpeed
                        ? `${(p.rawSpeed / 1024 / 1024).toFixed(1)} MB/s`
                        : null,
                      p?.eta
                        ? `${t.downloads?.remaining ?? ''} ${p.eta}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join('  ·  ')}
                    actions={
                      <>
                        <SheetAction
                          theme={theme}
                          label={t.downloads?.pause ?? ''}
                          onPress={() => modelStore.pauseDownload(job.model.id)}
                        />
                        <SheetAction
                          theme={theme}
                          destructive
                          label={t.downloads?.cancel ?? ''}
                          onPress={() =>
                            modelStore.cancelDownload(job.model.id)
                          }
                        />
                      </>
                    }
                  />
                );
              })}
            </Section>
          )}

          {/* Paused */}
          {pausedJobs.length > 0 && (
            <Section title={t.downloads?.paused ?? ''}>
              {pausedJobs.map(job => (
                <JobCard
                  key={job.model.id}
                  theme={theme}
                  title={extractFamilyLabel(job.model.repo ?? job.model.name)}
                  subtitle={job.model.filename}
                  progress={
                    job.state.progress
                      ? Math.floor(job.state.progress.progress)
                      : 0
                  }
                  detail={t.downloads?.pausedHint}
                  actions={
                    <>
                      <SheetAction
                        theme={theme}
                        label={t.downloads?.resume ?? ''}
                        onPress={() => modelStore.resumeDownload(job.model.id)}
                      />
                      <SheetAction
                        theme={theme}
                        destructive
                        label={t.downloads?.cancel ?? ''}
                        onPress={() => modelStore.cancelDownload(job.model.id)}
                      />
                    </>
                  }
                />
              ))}
            </Section>
          )}

          {/* Verifying */}
          {verifyingIds.length > 0 && (
            <Section title={t.downloads?.verifying ?? ''}>
              {verifyingIds.map(id => {
                const model = modelStore.models.find(m => m.id === id);
                return (
                  <JobCard
                    key={id}
                    theme={theme}
                    title={
                      model ? extractFamilyLabel(model.repo ?? model.name) : id
                    }
                    subtitle={model?.filename ?? ''}
                    progress={100}
                    detail={t.downloads?.verifyingHint}
                    actions={<View />}
                  />
                );
              })}
            </Section>
          )}

          {/* Completed */}
          {recentlyCompleted.length > 0 && (
            <Section title={t.downloads?.completed ?? ''}>
              {recentlyCompleted.map(m => (
                <View key={m.id} style={styles.completedRow}>
                  <View style={styles.flex1}>
                    <Text
                      style={[completedTitleStyle, styles.textSemibold]}
                      numberOfLines={1}>
                      {extractFamilyLabel(m.repo ?? m.name)}
                    </Text>
                    <Text style={[completedMetaStyle, styles.metaGap]}>
                      {[
                        m.filename,
                        m.size > 0 ? formatBytes(m.size) : null,
                        m.downloadedAt
                          ? new Date(m.downloadedAt).toLocaleDateString()
                          : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </Text>
                  </View>
                  {modelHubStore.isFavorite(m.id) && (
                    <Text style={styles.favoriteHeart}>♥</Text>
                  )}
                </View>
              ))}
            </Section>
          )}
        </ScrollView>
      </Sheet>
    );
  },
);

const Section: React.FC<{title: string; children: React.ReactNode}> = ({
  title,
  children,
}) =>
  title ? (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  ) : null;

const JobCard: React.FC<{
  theme: any;
  title: string;
  subtitle: string;
  progress: number;
  detail?: string;
  actions: React.ReactNode;
}> = ({theme, title, subtitle, progress, detail, actions}) => {
  const jobCardBg = {backgroundColor: theme.colors.surfaceVariant};
  const trackBg = {backgroundColor: theme.colors.surface};
  const progressFillWidth: ViewStyle = {
    width: `${Math.max(2, Math.min(100, progress))}%`,
  };
  const jobTitleStyle = {
    ...theme.typography.uiS,
    color: theme.colors.onSurface,
  };
  const jobSubtitleStyle = {
    ...theme.typography.captionM,
    color: theme.colors.onSurfaceVariant,
  };
  const jobDetailStyle = {
    ...theme.typography.captionM,
    color: theme.colors.onSurfaceVariant,
  };
  return (
    <View style={[styles.jobCard, jobCardBg]}>
      <View style={styles.jobCardHeader}>
        <View style={styles.flex1}>
          <Text style={[jobTitleStyle, styles.textBold]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[jobSubtitleStyle, styles.metaGap]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Text style={[theme.typography.titleS, styles.jobPercent]}>
          {progress}%
        </Text>
      </View>

      <View style={[styles.progressTrack, trackBg]}>
        <LinearGradient
          colors={['#7C3AED', '#2563EB']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={[progressFillWidth, styles.progressFill]}
        />
      </View>

      {detail ? (
        <Text style={[jobDetailStyle, styles.detailGap]}>{detail}</Text>
      ) : null}

      <View style={styles.jobCardActions}>{actions}</View>
    </View>
  );
};

const SheetAction: React.FC<{
  theme: any;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}> = ({theme, label, onPress, destructive}) => {
  const actionBg = {
    backgroundColor: destructive
      ? theme.colors.errorContainer
      : theme.colors.surface,
  };
  const actionLabelStyle = {
    ...theme.typography.captionM,
    color: destructive ? theme.colors.error : theme.colors.onSurface,
  };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.sheetAction, actionBg]}>
      <Text style={[actionLabelStyle, styles.textBold]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  scrollContent: {paddingHorizontal: 20, paddingBottom: 40},
  emptyContainer: {alignItems: 'center', paddingVertical: 48},
  emptyHint: {marginTop: 6, textAlign: 'center', lineHeight: 19},
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  flex1: {flex: 1},
  favoriteHeart: {color: '#EC4899'},
  sectionWrap: {marginBottom: 18},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#7C3AED',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  jobCard: {borderRadius: 14, padding: 14, marginBottom: 10},
  jobCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {height: '100%', borderRadius: 3},
  jobPercent: {fontWeight: '800', color: '#7C3AED'},
  jobCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    justifyContent: 'flex-end',
  },
  sheetAction: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10},
  textBold: {fontWeight: '700'},
  textSemibold: {fontWeight: '600'},
  metaGap: {marginTop: 2},
  detailGap: {marginTop: 8},
});

export const extractQuant = extractQuantLabel;
