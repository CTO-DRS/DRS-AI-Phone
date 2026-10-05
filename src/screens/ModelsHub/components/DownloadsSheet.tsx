import React, {useContext} from 'react';
import {ScrollView, Text, View, Pressable} from 'react-native';
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

    return (
      <Sheet
        isVisible={visible}
        snapPoints={['80%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={onClose}
        showCloseButton>
        <ScrollView
          contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 40}}>
          {empty && (
            <View style={{alignItems: 'center', paddingVertical: 48}}>
              <Text
                style={{
                  ...theme.typography.titleS,
                  color: theme.colors.onSurface,
                  fontWeight: '700',
                }}>
                {t.downloads?.emptyTitle}
              </Text>
              <Text
                style={{
                  ...theme.typography.bodyS,
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 6,
                  textAlign: 'center',
                  lineHeight: 19,
                }}>
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
                <View
                  key={m.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    gap: 10,
                  }}>
                  <View style={{flex: 1}}>
                    <Text
                      style={{
                        ...theme.typography.uiS,
                        fontWeight: '600',
                        color: theme.colors.onSurface,
                      }}
                      numberOfLines={1}>
                      {extractFamilyLabel(m.repo ?? m.name)}
                    </Text>
                    <Text
                      style={{
                        ...theme.typography.captionM,
                        color: theme.colors.onSurfaceVariant,
                        marginTop: 2,
                      }}>
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
                    <Text style={{color: '#EC4899'}}>♥</Text>
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
    <View style={{marginBottom: 18}}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '800',
          letterSpacing: 0.5,
          color: '#7C3AED',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}>
        {title}
      </Text>
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
}> = ({theme, title, subtitle, progress, detail, actions}) => (
  <View
    style={{
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceVariant,
      padding: 14,
      marginBottom: 10,
    }}>
    <View
      style={{flexDirection: 'row', justifyContent: 'space-between', gap: 10}}>
      <View style={{flex: 1}}>
        <Text
          style={{
            ...theme.typography.uiS,
            fontWeight: '700',
            color: theme.colors.onSurface,
          }}
          numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={{
            ...theme.typography.captionM,
            color: theme.colors.onSurfaceVariant,
            marginTop: 2,
          }}
          numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text
        style={{
          ...theme.typography.titleS,
          fontWeight: '800',
          color: '#7C3AED',
        }}>
        {progress}%
      </Text>
    </View>

    <View
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.surface,
        marginTop: 10,
        overflow: 'hidden',
      }}>
      <LinearGradient
        colors={['#7C3AED', '#2563EB']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={{
          width: `${Math.max(2, Math.min(100, progress))}%`,
          height: '100%',
          borderRadius: 3,
        }}
      />
    </View>

    {detail ? (
      <Text
        style={{
          ...theme.typography.captionM,
          color: theme.colors.onSurfaceVariant,
          marginTop: 8,
        }}>
        {detail}
      </Text>
    ) : null}

    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        justifyContent: 'flex-end',
      }}>
      {actions}
    </View>
  </View>
);

const SheetAction: React.FC<{
  theme: any;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}> = ({theme, label, onPress, destructive}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    style={{
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: destructive
        ? theme.colors.errorContainer
        : theme.colors.surface,
    }}>
    <Text
      style={{
        ...theme.typography.captionM,
        fontWeight: '700',
        color: destructive ? theme.colors.error : theme.colors.onSurface,
      }}>
      {label}
    </Text>
  </Pressable>
);

export const extractQuant = extractQuantLabel;
