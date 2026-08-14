export type ApplicationErrorCode =
  | "unauthenticated"
  | "invalid_personal_account"
  | "invalid_survey"
  | "closed_survey"
  | "unauthorized_property"
  | "invalid_answers"
  | "duplicate_vote"
  | "not_found";

export class ApplicationError extends Error {
  constructor(readonly code: ApplicationErrorCode, message: string) {
    super(message);
    this.name = "ApplicationError";
  }
}
