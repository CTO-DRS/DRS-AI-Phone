import {useEffect, useState, useContext, useRef} from 'react';

import DeviceInfo from 'react-native-device-info';

import {formatBytes, hasEnoughSpace} from '../utils';
import {L10nContext} from '../utils';
import {t} from '../locales';

import {Model, ModelOrigin} from '../utils/types';

interface StorageCheckOptions {
  /**
   * Whether to periodically check storage.
   * If false, storage will only be checked once.
   * @default true
   */
  enablePeriodicCheck?: boolean;
  /**
   * Interval in milliseconds for storage checks when periodic checking is enabled
   * @default 10000 (10 seconds)
   */
  checkInterval?: number;
}

export const useStorageCheck = (
  model: Model,
  options: StorageCheckOptions = {},
) => {
  const {enablePeriodicCheck = true, checkInterval = 10000} = options;
  const l10n = useContext(L10nContext);

  const [storageStatus, setStorageStatus] = useState({
    isOk: true,
    message: '',
  });

  // PERF-03: callers pass a fresh `model` object identity on every render
  // (ModelCard maps store lists), which used to tear this effect down and
  // rebuild it — re-running the one-shot storage probe and re-creating the
  // interval — on each render. The probe only reads the fields destructured
  // below, so depend on those VALUES instead of the object reference; the
  // ref keeps the latest object for the fields read at probe time.
  const modelRef = useRef(model);
  modelRef.current = model;
  const {isDownloaded, isLocal, origin, size} = model;
  // PERF-02: a model already on disk can never be "not enough space" —
  // gate the whole effect (one-shot probe AND interval) on that state so
  // the timer stops instead of waking every checkInterval just to return
  // early. The gate is itself a dependency, so a model deleted while the
  // card is still mounted re-arms the checks.
  const isOnDisk = isDownloaded || isLocal || origin === ModelOrigin.LOCAL;

  // Effect to check storage and set up periodic checking if enabled
  useEffect(() => {
    if (isOnDisk) {
      return;
    }

    const abortController = new AbortController();

    const checkStorage = async () => {
      try {
        const currentModel = modelRef.current;
        // Belt-and-braces: the effect-level gate above already skips
        // on-disk models; this guard also covers a download completing
        // between effect runs (before a re-render re-evaluates the gate).
        if (
          currentModel.isDownloaded ||
          currentModel.isLocal ||
          currentModel.origin === ModelOrigin.LOCAL
        ) {
          return;
        }

        const isEnoughSpace = await hasEnoughSpace(currentModel);
        if (abortController.signal.aborted) {
          return;
        }

        if (!isEnoughSpace) {
          const freeDisk = await DeviceInfo.getFreeDiskStorage('important');
          if (abortController.signal.aborted) {
            return;
          }

          // Use localized template string with variables
          const message = t(l10n.storage.lowStorage, {
            modelSize: formatBytes(currentModel.size),
            freeSpace: formatBytes(freeDisk),
          });

          setStorageStatus({
            isOk: false,
            message,
          });
        } else {
          setStorageStatus({
            isOk: true,
            message: '',
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Storage check failed:', error);
          setStorageStatus({isOk: false, message: l10n.storage.checkFailed});
        }
      }
    };

    checkStorage();
    let intervalId: NodeJS.Timeout | undefined;
    if (enablePeriodicCheck) {
      intervalId = setInterval(checkStorage, checkInterval);
    }

    return () => {
      abortController.abort();
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isOnDisk, size, enablePeriodicCheck, checkInterval, l10n]);

  return storageStatus;
};
