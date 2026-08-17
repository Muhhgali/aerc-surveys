import "server-only";

import type { DocumentStorageProvider, ProviderResult } from "@/src/application/ports/providers";
import type { RequestContext } from "@/src/domain/shared";
import type { DatabaseClient } from "@/src/infrastructure/database/client";

export class DatabaseDocumentStorageProvider implements DocumentStorageProvider {
  readonly name = "database" as const;
  constructor(private readonly sql: DatabaseClient) {}

  async put(input: { key: string; contentType: string; bytes: Uint8Array; sha256: string }, context: RequestContext): Promise<ProviderResult<{ storageKey: string; version: string }>> {
    const rows = await this.sql<{ sha256: string }[]>`
      insert into binary_assets (storage_key, content_type, bytes, sha256, size_bytes)
      values (${input.key}, ${input.contentType}, ${Buffer.from(input.bytes)}, ${input.sha256}, ${input.bytes.byteLength})
      on conflict (storage_key) do nothing returning sha256
    `;
    if (!rows[0]) {
      const existing = await this.sql<{ sha256: string }[]>`select sha256 from binary_assets where storage_key = ${input.key}`;
      if (existing[0]?.sha256 !== input.sha256) return failure("conflict", "Immutable storage key contains different bytes", context.requestId);
    }
    return { ok: true, value: { storageKey: input.key, version: input.sha256 } };
  }

  async get(input: { storageKey: string }, context: RequestContext): Promise<ProviderResult<{ contentType: string; bytes: Uint8Array; sha256: string }>> {
    const rows = await this.sql<{ contentType: string; bytes: Buffer; sha256: string }[]>`
      select content_type as "contentType", bytes, sha256 from binary_assets where storage_key = ${input.storageKey} limit 1
    `;
    if (!rows[0]) return failure("not_found", "Stored asset was not found", context.requestId);
    return { ok: true, value: { contentType: rows[0].contentType, bytes: new Uint8Array(rows[0].bytes), sha256: rows[0].sha256 } };
  }
}

function failure(code: "conflict" | "not_found", message: string, requestId: string): ProviderResult<never> {
  return { ok: false, error: { code, message, requestId, retryable: false } };
}
