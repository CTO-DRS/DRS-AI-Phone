import React, {useContext, useState} from 'react';
import {Text, View, Pressable} from 'react-native';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {modelStore} from '../../../store';
import {fetchModelFilesDetails} from '../../../api/hf';
import {hfStore} from '../../../store';
import {Model, ModelOrigin, ModelFileDetails} from '../../../utils/types';
import {formatBytes} from '../../../utils';
import {extractFamilyLabel} from '../../../utils/modelTaxonomy';

export interface UpdateCandidate {
  model: Model;
  currentOid: string | null;
  latestOid: string | null;
  latestSize: number | null;
  latestFilename: string | null;
  lastModified: string | null;
}

interface UpdatesSectionProps {
  onUpdate: (candidate: UpdateCandidate) => void;
}

/**
 * Real update detection: compares the SHA-256 (LFS oid) captured at download
 * time against the file's current oid on HuggingFace. Only installed HF
 * models participate. Checks run on explicit user action or automatically
 * for models enrolled in auto-update.
 */
export const checkModelUpdates = async (
  models: Model[],
): Promise<UpdateCandidate[]> => {
  const candidates: UpdateCandidate[] = [];
  const targets = models.filter(
    m => m.isDownloaded && m.origin === ModelOrigin.HF && m.repo && m.filename,
  );
  for (const model of targets) {
    try {
      const details: ModelFileDetails[] = await fetchModelFilesDetails(
        model.repo!,
        hfStore.hfToken ?? undefined,
      );
      const matching = details.find(d => d.path === model.filename);
      if (!matching) {
        continue;
      }
      const latestOid = matching.lfs?.oid ?? null;
      const currentOid = model.hfModelFile?.lfs?.oid ?? null;
      const changed =
        latestOid != null && currentOid != null && latestOid !== currentOid;
      // New file with no local baseline also counts as outdated only when we
      // genuinely have a mismatch — never invent an update from missing data.
      if (changed) {
        candidates.push({
          model,
          currentOid,
          latestOid,
          latestSize: matching.lfs?.size ?? matching.size ?? null,
          latestFilename: matching.path,
          lastModified: null,
        });
      }
    } catch {
      // Network/scoped failures are silently skipped — updates are opt-in info.
    }
  }
  return candidates;
};

export const UpdatesSection: React.FC<UpdatesSectionProps> = observer(
  ({onUpdate}) => {
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const t = (l10n as any).modelsHub ?? {};
    const [checking, setChecking] = useState(false);
    const [candidates, setCandidates] = useState<UpdateCandidate[]>([]);
    const [checked, setChecked] = useState(false);

    const runCheck = async () => {
      setChecking(true);
      try {
        const found = await checkModelUpdates(modelStore.models);
        setCandidates(found);
        setChecked(true);
      } finally {
        setChecking(false);
      }
    };

    const hasUpdates = candidates.length > 0;

    return (
      <View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            marginTop: 20,
            marginBottom: 8,
          }}>
          <Text
            style={{
              ...theme.typography.titleM,
              fontWeight: '700',
              color: theme.colors.onSurface,
            }}>
            {t.updates?.title}
            {hasUpdates ? ` (${candidates.length})` : ''}
          </Text>
          <Pressable
            onPress={runCheck}
            disabled={checking}
            accessibilityRole="button"
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: theme.colors.surfaceVariant,
            }}>
            <Text
              style={{
                ...theme.typography.captionM,
                fontWeight: '700',
                color: checking ? theme.colors.onSurfaceVariant : '#2563EB',
              }}>
              {checking
                ? t.updates?.checking
                : checked
                  ? t.updates?.recheck
                  : t.updates?.check}
            </Text>
          </Pressable>
        </View>

        {checked && !hasUpdates && (
          <Text
            style={{
              ...theme.typography.captionM,
              color: theme.colors.onSurfaceVariant,
              paddingHorizontal: 20,
            }}>
            {t.updates?.upToDate}
          </Text>
        )}

        {candidates.map(candidate => (
          <View
            key={candidate.model.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginHorizontal: 16,
              marginBottom: 8,
              padding: 12,
              borderRadius: 14,
              backgroundColor: theme.colors.surfaceVariant,
              gap: 10,
            }}>
            <View style={{flex: 1}}>
              <Text
                style={{
                  ...theme.typography.uiS,
                  fontWeight: '700',
                  color: theme.colors.onSurface,
                }}
                numberOfLines={1}>
                {extractFamilyLabel(
                  candidate.model.repo ?? candidate.model.name,
                )}
              </Text>
              <Text
                style={{
                  ...theme.typography.captionM,
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 2,
                }}>
                {candidate.model.filename}
                {candidate.latestSize != null
                  ? `  ·  ${formatBytes(candidate.latestSize)}`
                  : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => onUpdate(candidate)}
              accessibilityRole="button"
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: '#7C3AED',
              }}>
              <Text
                style={{
                  ...theme.typography.captionM,
                  fontWeight: '700',
                  color: '#FFFFFF',
                }}>
                {t.updates?.update}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    );
  },
);
