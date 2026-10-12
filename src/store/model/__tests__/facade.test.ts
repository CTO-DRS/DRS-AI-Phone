/**
 * Facade contract tests (fix 4, stage 1 of 4).
 * Guards the zero-logic pass-through property against silent breakage:
 *   1. domain surface completeness (every contract member exists, right kind)
 *   2. live-state identity (getters return the SAME references, not copies)
 *   3. semantic traps (isDownloading stays a curried function)
 *   4. domain purity (no cross-domain leakage between the three stores)
 *   5. barrel identity (facade re-exports the same singletons)
 *
 * Mock pattern copied from ModelStore.test.ts (the ModelStore constructor
 * performs network/rule fetches — they must be stubbed at the module
 * boundary). Local mocks only; mock vars carry the `mock` prefix; no
 * logging after suites complete; no timers left open.
 */
jest.unmock('../../../store');

import {modelStore} from '../../ModelStore';
import {catalogStore, CATALOG_MEMBERS} from '../catalogStore';
import {downloadStore, DOWNLOAD_MEMBERS} from '../downloadStore';
import {runtimeStore, RUNTIME_MEMBERS} from '../runtimeStore';
import * as facade from '../index';

jest.mock('../../../utils/deviceCapabilities', () => ({
  ...jest.requireActual('../../../utils/deviceCapabilities'),
  getCpuCoreCount: jest.fn().mockResolvedValue(8),
  getRecommendedThreadCount: jest.fn().mockResolvedValue(6),
  checkGpuSupport: jest.fn().mockResolvedValue({isSupported: false}),
  isHighEndDevice: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../../api/hf', () => ({
  fetchModelFilesDetails: jest.fn(),
}));

jest.mock('../../../services/downloads', () => {
  class MockDownloadCancelledError extends Error {
    modelId: string;
    constructor(modelId: string) {
      super(`Download cancelled for ${modelId}`);
      this.name = 'DownloadCancelledError';
      this.modelId = modelId;
    }
  }
  return {
    DownloadCancelledError: MockDownloadCancelledError,
    downloadManager: {
      isDownloading: jest.fn().mockReturnValue(false),
      startDownload: jest.fn(),
      cancelDownload: jest.fn(),
      setCallbacks: jest.fn(),
      syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
      activeJobs: [],
    },
  };
});

jest.mock('../../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../services/deviceRules/signals', () => ({
  readDeviceSignals: jest
    .fn()
    .mockResolvedValue({ramBytes: 8 * 1e9, socModel: 'SM8850'}),
}));

const kindOf = (v: unknown): 'function' | 'value' =>
  typeof v === 'function' ? 'function' : 'value';

describe('facade contract — zero-logic pass-through', () => {
  it('exposes the complete download domain surface with the right member kinds', () => {
    for (const member of DOWNLOAD_MEMBERS) {
      expect(member in downloadStore).toBe(true);
      const facadeValue = (downloadStore as Record<string, unknown>)[member];
      const sourceValue = (modelStore as Record<string, unknown>)[member];
      expect(kindOf(facadeValue)).toBe(kindOf(sourceValue));
    }
  });

  it('exposes the complete catalog and runtime domain surfaces', () => {
    for (const member of CATALOG_MEMBERS) {
      expect(member in catalogStore).toBe(true);
      const facadeValue = (catalogStore as Record<string, unknown>)[member];
      const sourceValue = (modelStore as Record<string, unknown>)[member];
      expect(kindOf(facadeValue)).toBe(kindOf(sourceValue));
    }
    for (const member of RUNTIME_MEMBERS) {
      expect(member in runtimeStore).toBe(true);
      const facadeValue = (runtimeStore as Record<string, unknown>)[member];
      const sourceValue = (modelStore as Record<string, unknown>)[member];
      expect(kindOf(facadeValue)).toBe(kindOf(sourceValue));
    }
  });

  it('returns live state — same references, not snapshots', () => {
    // Stable observable fields: identity must hold through the pass-through
    expect(catalogStore.models).toBe(modelStore.models);
    expect(downloadStore.downloadError).toBe(modelStore.downloadError);
    expect(runtimeStore.contextInitParams).toBe(modelStore.contextInitParams);
    expect(runtimeStore.activeModelId).toBe(modelStore.activeModelId);
    // activeDownloads is a computed-style getter on the god object that
    // builds a fresh array per access — identity is impossible BY DESIGN;
    // the contract here is equal content from the same delegate.
    expect(downloadStore.activeDownloads).toStrictEqual(
      modelStore.activeDownloads,
    );
  });

  it('preserves the isDownloading curried-function trap verbatim', () => {
    expect(typeof downloadStore.isDownloading).toBe('function');
    expect(typeof modelStore.isDownloading).toBe('function');
    // Same delegate outcome through the pass-through
    expect(downloadStore.isDownloading('any-model-id')).toBe(
      modelStore.isDownloading('any-model-id'),
    );
  });

  it('keeps domain purity — no cross-domain leakage between stores', () => {
    const asRecord = (o: unknown) => o as Record<string, unknown>;
    // downloadStore must NOT expose catalog/runtime members
    expect(asRecord(downloadStore).selectModel).toBeUndefined();
    expect(asRecord(downloadStore).models).toBeUndefined();
    expect(asRecord(downloadStore).initContext).toBeUndefined();
    // catalogStore must NOT expose download/runtime members
    expect(asRecord(catalogStore).checkSpaceAndDownload).toBeUndefined();
    expect(asRecord(catalogStore).downloadHFModel).toBeUndefined();
    expect(asRecord(catalogStore).initContext).toBeUndefined();
    // runtimeStore must NOT expose download/catalog members
    expect(asRecord(runtimeStore).checkSpaceAndDownload).toBeUndefined();
    expect(asRecord(runtimeStore).downloadHFModel).toBeUndefined();
    expect(asRecord(runtimeStore).addHFModel).toBeUndefined();
  });

  it('barrel re-exports the exact same singletons as the direct imports', () => {
    expect(facade.downloadStore).toBe(downloadStore);
    expect(facade.catalogStore).toBe(catalogStore);
    expect(facade.runtimeStore).toBe(runtimeStore);
  });
});
