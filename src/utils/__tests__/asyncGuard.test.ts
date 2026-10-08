import {TimeoutError, withTimeout, yieldToUI} from '../asyncGuard';

/**
 * Captures the outcome of `promise` without awaiting it yet, so fake
 * timers can be advanced before the assertion runs.
 */
const capture = (promise: Promise<unknown>) =>
  promise.then(
    value => ({kind: 'resolved' as const, value}),
    error => ({kind: 'rejected' as const, error}),
  );

describe('asyncGuard', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withTimeout', () => {
    it('resolves with the wrapped value when the promise settles in time', async () => {
      await expect(
        withTimeout(Promise.resolve(42), 1000, 'fast-op'),
      ).resolves.toBe(42);
    });

    it('propagates a rejection that happens before the deadline', async () => {
      const boom = Promise.reject(new Error('boom'));
      await expect(withTimeout(boom, 1000, 'rejecting-op')).rejects.toThrow(
        'boom',
      );
    });

    it('rejects with a TimeoutError when the deadline elapses first', async () => {
      jest.useFakeTimers();
      const never = new Promise<void>(() => {});
      const outcome = capture(withTimeout(never, 250, 'stuck-db-op'));
      jest.advanceTimersByTime(300);

      const result = await outcome;
      expect(result.kind).toBe('rejected');
      expect(
        result.kind === 'rejected' ? result.error : undefined,
      ).toBeInstanceOf(TimeoutError);
    });

    it('names the operation and the deadline in the error', async () => {
      jest.useFakeTimers();
      const never = new Promise<void>(() => {});
      const outcome = capture(withTimeout(never, 5, 'legacy-data-migration'));
      jest.advanceTimersByTime(10);

      const result = await outcome;
      expect(result.kind === 'rejected' ? result.error.message : '').toBe(
        'timeout after 5ms: legacy-data-migration',
      );
    });

    it('does not leave an unhandled rejection when the loser rejects late', async () => {
      jest.useFakeTimers();
      let rejectLater!: (error: Error) => void;
      const late = new Promise<never>((_resolve, reject) => {
        rejectLater = reject;
      });
      const outcome = capture(withTimeout(late, 50, 'late-reject'));
      jest.advanceTimersByTime(60);

      const result = await outcome;
      expect(result.kind).toBe('rejected');

      // The losing promise now rejects. If withTimeout did not attach a
      // no-op catch, this would surface as an unhandled rejection and
      // fail the test run.
      jest.useRealTimers();
      rejectLater(new Error('too late'));
      await yieldToUI();
      await Promise.resolve();
    });
  });

  describe('yieldToUI', () => {
    it('resolves without a value so the event loop can flush frames', async () => {
      await expect(yieldToUI()).resolves.toBeUndefined();
    });
  });
});
