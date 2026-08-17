export type ApplicationErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_personal_account"
  | "invalid_survey"
  | "closed_survey"
  | "unauthorized_property"
  | "invalid_answers"
  | "invalid_vote_state"
  | "idempotency_conflict"
  | "concurrency_conflict"
  | "duplicate_vote"
  | "invalid_request"
  | "signing_failed"
  | "document_failed"
  | "not_found";

export class ApplicationError extends Error {
  constructor(readonly code: ApplicationErrorCode, message: string) {
    super(message);
    this.name = "ApplicationError";
  }
}
