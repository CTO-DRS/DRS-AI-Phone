import {runInAction} from 'mobx';
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import {HuggingFaceModel, Model, ModelFile, ModelType} from '../../utils/types';
import {classify, ClassifyPlatform} from '../../services/deviceRules/classify';
import {deriveUrl, parseDeviceRules} from '../../services/deviceRules/parse';
import {fetchRules} from '../../services/deviceRules/rules';
import {readDeviceSignals} from '../../services/deviceRules/signals';
import {RuleCandidate, RuleDraft} from '../../services/deviceRules/types';
import {hfAsModel} from '../../utils';
import androidRulesRaw from '../bundledDeviceRules/rules.android.json';
import iosRulesRaw from '../bundledDeviceRules/rules.ios.json';

// Type-only import: keeps the runtime dependency graph acyclic while the
// manager reads/writes the observable fields of the store it belongs to.
import type {ModelStore} from '../ModelStore';

/**
 * Device-rules and draft-model resolution, extracted from ModelStore
 * (audit F-12 continuation). Owns the bundled-rules preset pipeline:
 * pairing candidate presets with existing models, materializing draft
 * stubs, resolving the preset model list, and upgrading persisted
 * presets when newer fetched device rules arrive.
 *
 * Reads and writes go through the host store's observable fields, so
 * MobX tracking/action semantics are unchanged; the store keeps
 * delegating members with the same names and signatures as before the
 * extraction.
 */
export class DraftRulesManager {
  constructor(private readonly host: ModelStore) {}

  candidateToPair = (
    candidate: RuleCandidate,
  ): {hfModel: HuggingFaceModel; modelFile: ModelFile} => {
    const modelFile: ModelFile = {
      rfilename: candidate.hfFilename,
      url: deriveUrl(candidate.hfRepo, candidate.hfFilename),
      size: candidate.sizeBytes,
    };
    const siblings: ModelFile[] | undefined = candidate.mmproj
      ? [
          {rfilename: candidate.hfFilename, size: candidate.sizeBytes},
          {
            rfilename: candidate.mmproj.hfFilename,
            url: deriveUrl(
              candidate.mmproj.hfRepo,
              candidate.mmproj.hfFilename,
            ),
            size: candidate.mmproj.sizeBytes,
          },
        ]
      : undefined;
    const hfModel = {
      id: candidate.hfRepo,
      author: candidate.hfRepo.split('/')[0],
      url: `https://huggingface.co/${candidate.hfRepo}`,
      specs: {gguf: {total: candidate.params ?? 0}},
      siblings,
    } as unknown as HuggingFaceModel;
    return {hfModel, modelFile};
  };

  draftToStub = (draft: RuleDraft): Model => {
    const modelFile: ModelFile = {
      rfilename: draft.hfFilename,
      url: deriveUrl(draft.hfRepo, draft.hfFilename),
      size: draft.sizeBytes,
    };
    const hfModel = {
      id: draft.hfRepo,
      author: draft.hfRepo.split('/')[0],
      url: `https://huggingface.co/${draft.hfRepo}`,
      specs: {gguf: {total: 0}},
      siblings: undefined,
    } as unknown as HuggingFaceModel;
    return {...hfAsModel(hfModel, modelFile), modelType: ModelType.DRAFT};
  };

  resolvePresets = async (): Promise<Model[]> => {
    try {
      const signals = await readDeviceSignals();
      const bundledRaw = Platform.OS === 'ios' ? iosRulesRaw : androidRulesRaw;
      const rules = parseDeviceRules(bundledRaw, DeviceInfo.getVersion());
      const tier = classify(
        signals,
        rules.classifier,
        Platform.OS as ClassifyPlatform,
      );
      runInAction(() => {
        this.host.deviceTier = tier;
        this.host.rulesVersion = rules.rulesVersion;
      });
      return this.host.resolvePresetModels(rules, signals);
    } catch (error) {
      console.warn('[ModelStore] preset resolution failed:', error);
      return [];
    }
  };

  upgradeToFetchedRules = async (): Promise<void> => {
    try {
      const fetched = await fetchRules(DeviceInfo.getVersion());
      if (!fetched) {
        return;
      }
      const signals = await readDeviceSignals();
      const tier = classify(
        signals,
        fetched.classifier,
        Platform.OS as ClassifyPlatform,
      );
      runInAction(() => {
        this.host.deviceTier = tier;
        this.host.rulesVersion = fetched.rulesVersion;
      });
      this.host.reconcilePresets(
        this.host.resolvePresetModels(fetched, signals),
      );
    } catch (error) {
      console.warn('[ModelStore] fetched-rules upgrade failed:', error);
    }
  };
}
