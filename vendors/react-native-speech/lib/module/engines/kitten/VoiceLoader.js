'use strict';

/**
 * Voice Loader for Kitten TTS
 *
 * Loads and manages voice style embeddings for Kitten synthesis.
 * Kitten uses length-dependent voice styling: the embedding selected
 * depends on the raw text length, capped at the voice array's max index.
 *
 * Formula: ref_id = min(len(text), voices[voice].shape[0] - 1)
 *
 * Supports:
 * - Pre-converted JSON voice data (from NPZ via convert script)
 * - Manifest-based lazy loading
 */

import * as RNFS from '@dr.pogodin/react-native-fs';
import {KITTEN_BUILTIN_VOICES} from './constants.js';
import {createComponentLogger} from '../../utils/logger.js';
const log = createComponentLogger('Kitten', 'VoiceLoader');

/**
 * Voice data structure after NPZ-to-JSON conversion.
 * Each voice entry contains a flat array of embeddings and shape metadata.
 */

export class VoiceLoader {
  voices = new Map();
  availableVoices = [];
  isInitialized = false;

  // Lazy loading support

  lazyLoadingEnabled = false;
  pendingLoads = new Map();

  /**
   * Load voice data from pre-converted JSON.
   * Expected format (output of convert-kitten-voices.py):
   * {
   *   "Bella": { "embeddings": [[...], [...], ...], "shape": [N, D] },
   *   "Jasper": { "embeddings": [[...], [...], ...], "shape": [N, D] },
   *   ...
   * }
   */
  async loadFromJSON(data) {
    for (const [voiceId, voiceEntry] of Object.entries(data)) {
      const shape = [voiceEntry.shape[0], voiceEntry.shape[1]];

      // Flatten the 2D embeddings array into a 1D Float32Array
      const totalFloats = shape[0] * shape[1];
      const flatData = new Float32Array(totalFloats);
      let offset = 0;
      for (const row of voiceEntry.embeddings) {
        for (const val of row) {
          flatData[offset++] = val;
        }
      }
      this.voices.set(voiceId, {
        data: flatData,
        shape,
      });

      // Add voice metadata from builtins or create from ID
      const builtin = KITTEN_BUILTIN_VOICES.find(v => v.id === voiceId);
      if (builtin) {
        this.availableVoices.push(builtin);
      } else {
        this.availableVoices.push({
          id: voiceId,
          name: voiceId,
          gender: 'female',
          language: 'en',
        });
      }
    }
    this.isInitialized = true;
    log.info(`Loaded ${this.voices.size} voices from JSON`);
  }

  /**
   * Load voices from a manifest file (lazy loading mode).
   * Voices are downloaded on-demand when first requested.
   */
  async loadFromManifest(manifest, manifestPath) {
    this.manifestBaseUrl = manifest.baseUrl;
    this.lazyLoadingEnabled = true;

    // Extract directory from manifest path (strip file:// prefix for local FS ops)
    const cleanPath = manifestPath.replace(/^file:\/\//, '');
    const lastSlash = cleanPath.lastIndexOf('/');
    const baseDir = cleanPath.substring(0, lastSlash);
    this.manifestVoicesDir = `${baseDir}/voices`;

    // Register available voices without loading data
    for (const voiceId of manifest.voices) {
      const builtin = KITTEN_BUILTIN_VOICES.find(v => v.id === voiceId);
      if (builtin) {
        this.availableVoices.push(builtin);
      } else {
        this.availableVoices.push({
          id: voiceId,
          name: voiceId,
          gender: 'female',
          language: 'en',
        });
      }
    }
    this.isInitialized = true;
    log.info(
      `Manifest loaded: ${manifest.voices.length} voices available (lazy loading)`,
    );
  }

  /**
   * Get the style embedding for a voice, selected by raw text length.
   *
   * Kitten uses length-dependent voice styling:
   *   ref_id = min(len(text), N - 1)
   *   style = voices[voice][ref_id]
   *
   * @param voiceId - Voice name (e.g., 'Bella')
   * @param textLength - Length of the raw input text (before phonemization)
   * @returns Float32Array of shape [D] — the style embedding
   */
  async getStyleEmbedding(voiceId, textLength) {
    if (!this.isInitialized) {
      throw new Error('VoiceLoader not initialized');
    }
    let voiceData = this.voices.get(voiceId);
    if (!voiceData) {
      if (this.lazyLoadingEnabled) {
        voiceData = await this.lazyLoadVoice(voiceId);
        if (!voiceData) {
          throw new Error(`Voice not found: ${voiceId}`);
        }
      } else {
        throw new Error(`Voice not found: ${voiceId}`);
      }
    }
    const [numEmbeddings, embeddingDim] = voiceData.shape;

    // Length-dependent indexing: ref_id = min(textLength, N - 1)
    const refId = Math.min(Math.max(textLength, 0), numEmbeddings - 1);

    // Extract the embedding at refId
    const offset = refId * embeddingDim;
    return voiceData.data.slice(offset, offset + embeddingDim);
  }

  /**
   * Get list of available voices
   */
  getAvailableVoices() {
    return this.availableVoices;
  }

  /**
   * Check if voice loader is ready
   */
  isReady() {
    if (this.lazyLoadingEnabled) {
      return this.isInitialized && this.availableVoices.length > 0;
    }
    return this.isInitialized && this.voices.size > 0;
  }

  /**
   * Clear all voice data and reset.
   */
  clear() {
    this.voices.clear();
    this.availableVoices = [];
    this.pendingLoads.clear();
    this.manifestBaseUrl = undefined;
    this.manifestVoicesDir = undefined;
    this.lazyLoadingEnabled = false;
    this.isInitialized = false;
  }

  /**
   * Lazy load a voice from cache or download.
   * Race-condition safe via pendingLoads map.
   */
  async lazyLoadVoice(voiceId) {
    const pending = this.pendingLoads.get(voiceId);
    if (pending) {
      log.debug(`Waiting for pending load: ${voiceId}`);
      return pending;
    }
    const loadPromise = this.doLazyLoadVoice(voiceId);
    this.pendingLoads.set(voiceId, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.pendingLoads.delete(voiceId);
    }
  }
  async doLazyLoadVoice(voiceId) {
    try {
      const localPath = `${this.manifestVoicesDir}/${voiceId}.json`;
      const {loadAssetAsJSON} = require('../../utils/AssetLoader');
      let voiceJSON;
      try {
        log.debug(`Loading voice from cache: ${voiceId}`);
        voiceJSON = await loadAssetAsJSON(`file://${localPath}`);
      } catch {
        if (!this.manifestBaseUrl) {
          log.error(`No base URL for downloading voice: ${voiceId}`);
          return undefined;
        }
        log.debug(`Downloading voice: ${voiceId}`);
        const remoteUrl = `${this.manifestBaseUrl}/${voiceId}.json`;
        const response = await fetch(remoteUrl);
        if (!response.ok) {
          throw new Error(`Failed to download: ${response.statusText}`);
        }
        const jsonText = await response.text();
        voiceJSON = JSON.parse(jsonText);

        // Cache to disk for future sessions
        try {
          await RNFS.mkdir(this.manifestVoicesDir);
          await RNFS.writeFile(localPath, jsonText, 'utf8');
          log.debug(`Cached voice to disk: ${localPath}`);
        } catch (cacheErr) {
          log.warn(
            `Failed to cache voice ${voiceId}: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`,
          );
        }
      }
      const shape = [voiceJSON.shape[0], voiceJSON.shape[1]];
      const totalFloats = shape[0] * shape[1];
      const flatData = new Float32Array(totalFloats);
      let offset = 0;
      for (const row of voiceJSON.embeddings) {
        for (const val of row) {
          flatData[offset++] = val;
        }
      }
      const voiceData = {
        data: flatData,
        shape,
      };
      this.voices.set(voiceId, voiceData);
      log.debug(`Voice loaded: ${voiceId}, shape: [${shape[0]}, ${shape[1]}]`);
      return voiceData;
    } catch (error) {
      log.error(
        `Failed to lazy load voice ${voiceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}
//# sourceMappingURL=VoiceLoader.js.map
