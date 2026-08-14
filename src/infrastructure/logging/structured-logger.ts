export interface StructuredLogger {
  info(event: string, fields: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields: Readonly<Record<string, unknown>>): void;
  error(event: string, fields: Readonly<Record<string, unknown>>): void;
}

const sensitiveKeys = /token|secret|signature|national|iin|password|credential|documentBytes/i;

function redact(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, sensitiveKeys.test(key) ? "[REDACTED]" : value]));
}

export const consoleLogger: StructuredLogger = {
  info: (event, fields) => console.info(JSON.stringify({ level: "info", event, ...redact(fields) })),
  warn: (event, fields) => console.warn(JSON.stringify({ level: "warn", event, ...redact(fields) })),
  error: (event, fields) => console.error(JSON.stringify({ level: "error", event, ...redact(fields) })),
};
