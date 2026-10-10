/**
 * @format
 */

// Hermes/React Native ship no URL; it must exist before the app graph loads.
import 'react-native-url-polyfill/auto';

// Installed before the app graph loads so any module-evaluation failure is
// captured from the earliest possible moment (see src/utils/diagnostics.ts).
import './src/utils/diagnosticsInstall';

// v1.41.0: count this boot as "may fail" before anything else runs. If the
// process dies anywhere during startup, the streak survives in storage and
// the next launch enters safe mode (see src/utils/bootHealth.ts) instead of
// repeating an identical, undiagnosable death.
import {beginBootAttempt} from './src/utils/bootHealth';
beginBootAttempt();

import {AppRegistry, LogBox} from 'react-native';

// Silence LogBox in E2E builds so the in-app warning toast doesn't cover
// chat-bottom controls Appium needs. Left active otherwise so warnings
// surface during development.
if (__E2E__) {
  LogBox.ignoreAllLogs(true);
}

import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
