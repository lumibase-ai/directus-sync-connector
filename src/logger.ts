/** Tiny leveled logger. No deps; writes structured-ish lines to stderr/stdout. */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
  child(scope: string): Logger;
}

export function createLogger(level: LogLevel = 'info', scope?: string): Logger {
  const threshold = ORDER[level];

  function emit(lvl: LogLevel, msg: string, meta?: unknown): void {
    if (ORDER[lvl] < threshold) return;
    const prefix = scope ? `[${scope}] ` : '';
    const line = `${lvl.toUpperCase().padEnd(5)} ${prefix}${msg}`;
    const stream = ORDER[lvl] >= ORDER.warn ? console.error : console.log;
    if (meta !== undefined) stream(line, formatMeta(meta));
    else stream(line);
  }

  return {
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child: (childScope) => createLogger(level, scope ? `${scope}:${childScope}` : childScope),
  };
}

function formatMeta(meta: unknown): unknown {
  if (meta instanceof Error) {
    return { name: meta.name, message: meta.message, stack: meta.stack };
  }
  return meta;
}
