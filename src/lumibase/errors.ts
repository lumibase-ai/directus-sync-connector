/** Structured error mirroring @lumibase/sdk's LumibaseError. */

export interface LumibaseFieldError {
  code: string;
  message: string;
  path?: string;
}

export class LumibaseError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly errors?: LumibaseFieldError[];

  constructor(
    code: string,
    message: string,
    options?: { status?: number; errors?: LumibaseFieldError[]; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'LumibaseError';
    this.code = code;
    this.status = options?.status;
    this.errors = options?.errors;
  }

  /** True when the server reported the route/resource as missing. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  static fromResponse(status: number, body: unknown): LumibaseError {
    const b = (body ?? {}) as Record<string, unknown>;
    const err = (b.error ?? b) as Record<string, unknown>;
    return new LumibaseError(
      typeof err.code === 'string' ? err.code : `HTTP_${status}`,
      typeof err.message === 'string' ? err.message : `Request failed with status ${status}`,
      {
        status,
        errors: Array.isArray(err.errors) ? (err.errors as LumibaseFieldError[]) : undefined,
      },
    );
  }
}
