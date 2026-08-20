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
  sheetNumber?: number;
  phone?: string | null;
  email?: string | null;
  submittedAt?: string;
  electronicVoting?: boolean;
  signatories?: readonly { roleKey: string; displayName: string; signed?: boolean; image?: Uint8Array }[];
}

export interface ProtocolPdfModel {
  protocolNumber: string;
  titleRu: string;
  address: string;
  meetingForm: string;
  createdAt: string;
  documentId: string;
  verificationUrl: string;
  apartmentOwners: number;
  nonResidentialOwners: number;
  eligibleTotal: number;
  participated: number;
  questions: readonly { position: number; text: string; for: number; against: number; abstain: number; accepted: boolean }[];
  signatories: readonly { roleKey: string; displayName: string; signed?: boolean; image?: Uint8Array }[];
  draft: boolean;
}

export interface PdfRenderer {
  renderVotingSheet(model: VotingSheetPdfModel): Promise<Uint8Array>;
  renderProtocol(model: ProtocolPdfModel): Promise<Uint8Array>;
}
