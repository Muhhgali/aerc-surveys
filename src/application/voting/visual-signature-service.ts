import { createHash } from "node:crypto";
import { ApplicationError } from "@/src/application/errors";
import type { DocumentStorageProvider } from "@/src/application/ports/providers";
import type { VoteLifecycleRepository, VisualSignatureRecord } from "@/src/application/ports/vote-lifecycle-repository";
import type { VotingRepository } from "@/src/application/ports/data-repositories";
import type { RequestContext } from "@/src/domain/shared";
import { answersAreMutable } from "@/src/domain/vote-lifecycle";

const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export class VisualSignatureService {
  constructor(private readonly voting: VotingRepository, private readonly lifecycle: VoteLifecycleRepository, private readonly storage: DocumentStorageProvider) {}

  async save(input: { voteId: string; userId: string; png: Uint8Array; metadata?: Readonly<Record<string, unknown>> }, context: RequestContext): Promise<VisualSignatureRecord> {
    const vote = await this.voting.findOwnedVote(input.voteId, input.userId);
    if (!vote) throw new ApplicationError("not_found", "Vote draft was not found");
    if (!answersAreMutable(vote.status)) throw new ApplicationError("invalid_vote_state", "Visual signature cannot change after canonical snapshot is locked");
    if (input.png.byteLength < pngMagic.length || input.png.byteLength > 500_000 || !pngMagic.every((byte, index) => input.png[index] === byte)) {
      throw new ApplicationError("invalid_request", "Visual signature must be a PNG up to 500 KB");
    }
    const sha256 = createHash("sha256").update(input.png).digest("hex");
    const storageKey = `visual-signatures/${input.voteId}/${sha256}.png`;
    const stored = await this.storage.put({ key: storageKey, contentType: "image/png", bytes: input.png, sha256 }, context);
    if (!stored.ok) throw new ApplicationError("document_failed", "Visual signature asset could not be stored");
    return this.lifecycle.saveVisualSignature({ voteId: input.voteId, userId: input.userId, storageKey, sha256, metadata: { ...input.metadata, kind: "visual_signature", legalSignature: false } });
  }
}
