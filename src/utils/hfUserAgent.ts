import DeviceInfo from 'react-native-device-info';

/**
 * User-Agent for outbound Hugging Face requests (API + model downloads).
 * The `(com.drsai.app)` token is a fixed attribution key on both platforms.
 */
export const hfUserAgent = (): string =>
  `DRS AI/${DeviceInfo.getVersion()} (com.drsai.app)`;
