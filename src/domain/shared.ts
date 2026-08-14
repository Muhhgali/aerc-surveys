export type RequestId = string;
export type IsoDateTime = string;

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface RequestContext {
  requestId: RequestId;
  timeoutMs?: number;
  signal?: AbortSignal;
}
