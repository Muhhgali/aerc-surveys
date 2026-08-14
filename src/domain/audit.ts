export type AuditEventType =
  | "login"
  | "logout"
  | "account_lookup"
  | "survey_opened"
  | "answer_changed"
  | "vote_submitted"
  | "signature_started"
  | "signature_completed"
  | "document_generated"
  | "admin_change";
