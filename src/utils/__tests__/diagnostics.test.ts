// Uses the repo-wide global jest API (see exportUtils.test.ts): importing
// from '@jest/globals' pulls in stricter generic inference than @types/jest.

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{"events":[]}'),
  exists: jest.fn().mockResolvedValue(false),
}));

// After jest.resetModules() the mock module is re-created by the factory,
// so tests must fetch the CURRENT instance instead of a top-level import.
const fsMock = () =>
  jest.requireMock('@dr.pogodin/react-native-fs') as {
    mkdir: jest.Mock<any>;
    writeFile: jest.Mock<any>;
    readFile: jest.Mock<any>;
    exists: jest.Mock<any>;
  };

describe('diagnostics', () => {
  let diag: typeof import('../diagnostics');

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    diag = require('../diagnostics');
    diag._resetForTests();
  });

  afterEach(() => {
    diag._resetForTests();
  });

  describe('event recording', () => {
    it('records phases with a timestamp and kind', () => {
      diag.recordPhase('startup:hydrated');
      const events = diag.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('phase');
      expect(events[0].msg).toBe('startup:hydrated');
      expect(events[0].ts).toBeTruthy();
    });

    it('caps the ring buffer at 250 events, keeping the newest', () => {
      for (let i = 0; i < 300; i++) {
        diag.recordPhase(`phase-${i}`);
      }
      const events = diag.getEvents();
      expect(events).toHaveLength(250);
      expect(events[events.length - 1].msg).toBe('phase-299');
      expect(events[0].msg).toBe('phase-50');
    });

    it('records errors with context prefix and stack detail', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at fake';
      diag.recordError(err, 'error-boundary');
      const events = diag.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('error');
      expect(events[0].msg).toBe('error-boundary: boom');
      expect(events[0].detail).toContain('at fake');
    });

    it('records non-Error values without throwing', () => {
      diag.recordError(undefined);
      diag.recordError('plain string');
      diag.recordError(null);
      expect(diag.getEvents()).toHaveLength(3);
    });

    it('clearEvents empties both sessions', () => {
      diag.recordPhase('p1');
      diag.clearEvents();
      expect(diag.getEvents()).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    it('persists the serialized buffer to the log file', async () => {
      diag.recordPhase('persist-me');
      await diag.persistNow();
      const mock = fsMock();
      expect(mock.mkdir).toHaveBeenCalledWith('/mock/docs/diagnostics');
      expect(mock.writeFile).toHaveBeenCalledTimes(1);
      const [path, payload] = mock.writeFile.mock.calls[0] as [string, string];
      expect(path).toBe('/mock/docs/diagnostics/drsai-diagnostics.json');
      const parsed = JSON.parse(payload);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].msg).toBe('persist-me');
    });

    it('survives write failures silently', async () => {
      fsMock().writeFile.mockRejectedValueOnce(new Error('disk full'));
      diag.recordPhase('p');
      await expect(diag.persistNow()).resolves.toBeUndefined();
      // Events stay in memory for the report even when the write failed.
      expect(diag.getEvents()).toHaveLength(1);
    });
  });

  describe('global handlers', () => {
    it('is idempotent across repeated installs', () => {
      diag.installGlobalErrorHandlers({previousSessionLoadDelayMs: 0});
      const countAfterFirst = diag
        .getEvents()
        .filter(e => e.msg === 'app:bootstrap').length;
      diag.installGlobalErrorHandlers({previousSessionLoadDelayMs: 0});
      const countAfterSecond = diag
        .getEvents()
        .filter(e => e.msg === 'app:bootstrap').length;
      expect(countAfterFirst).toBe(1);
      expect(countAfterSecond).toBe(1);
    });

    it('chains the fatal-error handler and records the crash', () => {
      const previous = jest.fn();
      const holder = global as unknown as {
        ErrorUtils?: {
          getGlobalHandler?: () => typeof previous;
          setGlobalHandler?: (h: unknown) => void;
        };
      };
      holder.ErrorUtils = {
        getGlobalHandler: () => previous,
        setGlobalHandler: () => undefined,
      };
      let installed: ((error: unknown, isFatal?: boolean) => void) | undefined;
      holder.ErrorUtils.setGlobalHandler = h => {
        installed = h as typeof installed;
      };

      diag.installGlobalErrorHandlers({previousSessionLoadDelayMs: 0});
      expect(installed).toBeTruthy();

      const fatal = new Error('fatal-js');
      installed?.(fatal, true);

      const crashes = diag.getEvents().filter(e => e.kind === 'crash');
      expect(crashes).toHaveLength(1);
      expect(crashes[0].msg).toContain('fatal-js');
      // The pre-existing handler must still run (release crash flow).
      expect(previous).toHaveBeenCalledWith(fatal, true);
    });

    it('captures console.error output as error events', () => {
      diag.installGlobalErrorHandlers({previousSessionLoadDelayMs: 0});
      console.error('Something blew up', 'bad state');
      const errors = diag.getEvents().filter(e => e.kind === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0].msg).toContain('Something blew up');
      expect(errors[0].msg).toContain('bad state');
    });

    it('does not double-record the error boundary output', () => {
      diag.installGlobalErrorHandlers({previousSessionLoadDelayMs: 0});
      console.error('[GlobalErrorBoundary]', 'msg');
      const errors = diag.getEvents().filter(e => e.kind === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('report building', () => {
    it('builds a report with device-unavailable note and timeline', async () => {
      diag.recordPhase('startup:app-mounted');
      diag.recordError(new Error('render failed'), 'error-boundary');
      const report = await diag.buildDiagnosticsReport();
      expect(report).toContain('=== DRS AI diagnostics report ===');
      expect(report).toContain('app/device snapshot unavailable');
      expect(report).toContain('startup:app-mounted');
      expect(report).toContain('error-boundary: render failed');
    });

    it('includes the previous session when the persisted log has one', async () => {
      const mock = fsMock();
      mock.exists.mockResolvedValue(true);
      mock.readFile.mockResolvedValue(
        JSON.stringify({
          events: [
            {
              ts: '2026-01-01T00:00:00.000Z',
              kind: 'crash',
              msg: 'native crash',
            },
          ],
        }),
      );
      // v1.36.0: the previous-session read is deferred 8s in production;
      // collapse the delay so the await below flushes the load.
      diag.installGlobalErrorHandlers({previousSessionLoadDelayMs: 0});
      // Flush the async previous-session load (exists -> readFile chain).
      await new Promise(resolve => setTimeout(resolve, 0));
      const report = await diag.buildDiagnosticsReport();
      expect(report).toContain('native crash');
    });
  });
});
