import type { ProviderError, ProviderResult } from "@/src/application/ports/providers";
import type { RequestContext } from "@/src/domain/shared";
import type { StructuredLogger } from "@/src/infrastructure/logging/structured-logger";

export interface ProviderCallOptions {
  operation: string;
  idempotent: boolean;
  defaultTimeoutMs: number;
  maxRetries: number;
}

export class ProviderCallError extends Error {
  constructor(
    readonly code: ProviderError["code"],
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function executeProviderCall<T>(
  context: RequestContext,
  logger: StructuredLogger,
  options: ProviderCallOptions,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<ProviderResult<T>> {
  const attempts = options.idempotent ? options.maxRetries + 1 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(context.signal?.reason);
    context.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(() => controller.abort("provider_timeout"), context.timeoutMs ?? options.defaultTimeoutMs);
    try {
      logger.info("provider.call.started", { operation: options.operation, requestId: context.requestId, attempt });
      const value = await call(controller.signal);
      logger.info("provider.call.completed", { operation: options.operation, requestId: context.requestId, attempt });
      return { ok: true, value };
    } catch (cause) {
      const timedOut = controller.signal.aborted;
      const providerError = cause instanceof ProviderCallError ? cause : undefined;
      const error: ProviderError = {
        code: timedOut ? "timeout" : providerError?.code ?? "unavailable",
        message: timedOut ? "Provider call timed out" : providerError?.message ?? "Provider call failed",
        requestId: context.requestId,
        retryable: timedOut || providerError?.retryable === true || !providerError,
        cause,
      };
      logger.warn("provider.call.failed", { operation: options.operation, requestId: context.requestId, attempt, code: error.code });
      if (attempt === attempts || !error.retryable) return { ok: false, error };
      await wait(Math.min(100 * 2 ** (attempt - 1), 1_000));
    } finally {
      clearTimeout(timer);
      context.signal?.removeEventListener("abort", forwardAbort);
    }
  }
  throw new Error("Unreachable provider retry state");
}
