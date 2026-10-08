import {installGlobalErrorHandlers, recordPhase} from './diagnostics';

/**
 * Side-effect entry point, imported FIRST in index.js (before the app
 * graph) so any module-evaluation failure is captured from the earliest
 * possible moment. Kept as a separate module so importing
 * `src/utils/diagnostics` directly (tests, screens) stays side-effect
 * free.
 */
installGlobalErrorHandlers();
recordPhase('app:diagnostics-installed');
