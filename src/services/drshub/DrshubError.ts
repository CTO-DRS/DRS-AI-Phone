/**
 * Canonical DrshubError definition (audit F-12 hygiene: previously defined
 * identically in both DrshubService.ts and DrshubApiService.ts, which risked
 * the two copies drifting apart and made `instanceof` checks fragile if the
 * classes were ever diverged). Both services re-export this single class.
 */
export class DrshubError extends Error {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'DrshubError';
  }
}
