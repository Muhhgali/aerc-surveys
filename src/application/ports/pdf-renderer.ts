import type { VoteChoice } from "@/src/domain/voting";

export interface VotingSheetPdfModel {
  protocolNumber: string;
  address: string;
  accountReference: string;
  unit: string;
  participantDisplayName: string;
  createdAt: string;
  documentId: string;
  documentVersion: number;
  surveyVersion: number;
  signingProvider: string;
  signingStatus: string;
  documentHashReference: string;
  verificationUrl: string;
  questions: readonly { position: number; text: string; answer: VoteChoice }[];
  visualSignature?: Uint8Array;
}

export interface PdfRenderer { renderVotingSheet(model: VotingSheetPdfModel): Promise<Uint8Array>; }
