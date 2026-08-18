import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const userType = pgEnum("user_type", ["individual", "organization_representative"]);
export const recordStatus = pgEnum("record_status", ["active", "inactive", "blocked"]);
export const organizationType = pgEnum("organization_type", ["osi", "ksk", "management_company", "other"]);
export const organizationRole = pgEnum("organization_role", ["owner", "administrator", "representative", "auditor"]);
export const propertyType = pgEnum("property_type", ["apartment", "non_residential", "house", "other"]);
export const surveyStatus = pgEnum("survey_status", ["draft", "scheduled", "active", "closed", "archived"]);
export const questionStatus = pgEnum("question_status", ["active", "inactive"]);
export const surveyTargetType = pgEnum("survey_target_type", ["building", "property", "organization", "personal_account"]);
export const participantStatus = pgEnum("participant_status", ["eligible", "ineligible", "revoked"]);
export const voteSessionStatus = pgEnum("vote_session_status", ["draft", "ready_to_sign", "signing", "signed", "submitted", "voided"]);
export const voteStatus = pgEnum("vote_status", ["draft", "ready_to_sign", "signing", "signed", "submitted", "voided"]);
export const voteChoice = pgEnum("vote_choice", ["for", "against", "abstain"]);
export const signatureStatus = pgEnum("signature_status", ["created", "pending", "verified", "finalized", "failed", "expired", "cancelled"]);
export const documentStatus = pgEnum("document_status", ["pending", "generated", "failed", "archived"]);
export const integrationStatus = pgEnum("integration_status", ["started", "succeeded", "failed", "timed_out"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  iinHash: text("iin_hash"),
  phone: text("phone"),
  email: text("email"),
  type: userType("type").notNull().default("individual"),
  status: recordStatus("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("users_iin_hash_unique").on(table.iinHash).where(sql`${table.iinHash} is not null`),
  index("users_email_idx").on(table.email),
]);

export const externalIdentities = pgTable("external_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerSubject: text("provider_subject").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [
  uniqueIndex("external_identities_provider_subject_unique").on(table.provider, table.providerSubject),
  index("external_identities_user_idx").on(table.userId),
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  bin: text("bin").notNull().unique(),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  type: organizationType("type").notNull(),
  status: recordStatus("status").notNull().default("active"),
  ...timestamps,
});

export const organizationMembers = pgTable("organization_members", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: organizationRole("role").notNull(),
  verifiedSource: text("verified_source").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  primaryKey({ columns: [table.userId, table.organizationId] }),
  index("organization_members_org_idx").on(table.organizationId),
]);

export const properties = pgTable("properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  city: text("city").notNull(),
  street: text("street").notNull(),
  building: text("building").notNull(),
  premise: text("premise").notNull(),
  type: propertyType("property_type").notNull(),
  externalPropertyId: text("external_property_id"),
  source: text("source").notNull().default("mock"),
  status: recordStatus("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("properties_source_external_unique").on(table.source, table.externalPropertyId).where(sql`${table.externalPropertyId} is not null`),
  index("properties_building_idx").on(table.city, table.street, table.building),
]);

export const personalAccounts = pgTable("personal_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalAccountId: text("external_account_id").notNull(),
  accountNumber: text("account_number").notNull(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
  source: text("source").notNull().default("mock"),
  status: recordStatus("status").notNull().default("active"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("personal_accounts_source_external_unique").on(table.source, table.externalAccountId),
  uniqueIndex("personal_accounts_source_number_unique").on(table.source, table.accountNumber),
  index("personal_accounts_property_idx").on(table.propertyId),
]);

/**
 * Trusted local read model of who holds a property or personal account.
 * Populated by development/preview fixtures today and by `AercPropertyProvider`
 * once the billing contract exists. Survey targeting resolves eligibility from here.
 */
export const propertyHoldings = pgTable("property_holdings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
  personalAccountId: uuid("personal_account_id").references(() => personalAccounts.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  source: text("source").notNull().default("mock"),
  status: recordStatus("status").notNull().default("active"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("property_holdings_identity_account_unique").on(table.userId, table.propertyId, table.personalAccountId)
    .where(sql`${table.personalAccountId} is not null`),
  uniqueIndex("property_holdings_identity_property_unique").on(table.userId, table.propertyId)
    .where(sql`${table.personalAccountId} is null`),
  index("property_holdings_property_idx").on(table.propertyId),
  index("property_holdings_account_idx").on(table.personalAccountId),
]);

export const surveys = pgTable("surveys", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  protocolNumber: text("protocol_number").notNull(),
  version: integer("version").notNull().default(1),
  titleRu: text("title_ru").notNull(),
  titleKk: text("title_kk"),
  descriptionRu: text("description_ru").notNull().default(""),
  descriptionKk: text("description_kk").notNull().default(""),
  lockVersion: integer("lock_version").notNull().default(1),
  status: surveyStatus("status").notNull().default("draft"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("surveys_org_protocol_unique").on(table.organizationId, table.protocolNumber),
  index("surveys_status_period_idx").on(table.status, table.startsAt, table.closesAt),
  check("surveys_period_valid", sql`${table.closesAt} is null or ${table.startsAt} is null or ${table.closesAt} > ${table.startsAt}`),
]);

export const surveyQuestions = pgTable("survey_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  textRu: text("text_ru").notNull(),
  textKk: text("text_kk"),
  required: boolean("required").notNull().default(true),
  status: questionStatus("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("survey_questions_survey_position_unique").on(table.surveyId, table.position),
  check("survey_questions_position_positive", sql`${table.position} > 0`),
]);

export const surveyVersions = pgTable("survey_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  sha256: text("sha256").notNull(),
  publishedByUserId: uuid("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("survey_versions_survey_version_unique").on(table.surveyId, table.version),
  check("survey_versions_version_positive", sql`${table.version} > 0`),
]);

export const surveyTargets = pgTable("survey_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
  type: surveyTargetType("target_type").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "restrict" }),
  personalAccountId: uuid("personal_account_id").references(() => personalAccounts.id, { onDelete: "restrict" }),
  city: text("city"),
  street: text("street"),
  building: text("building"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("survey_targets_survey_idx").on(table.surveyId),
  check("survey_targets_reference_matches_type", sql`
    (${table.type} = 'organization' and ${table.organizationId} is not null and ${table.propertyId} is null and ${table.personalAccountId} is null)
    or (${table.type} = 'property' and ${table.organizationId} is null and ${table.propertyId} is not null and ${table.personalAccountId} is null)
    or (${table.type} = 'personal_account' and ${table.organizationId} is null and ${table.propertyId} is null and ${table.personalAccountId} is not null)
    or (${table.type} = 'building' and ${table.organizationId} is null and ${table.propertyId} is null and ${table.personalAccountId} is null and ${table.city} is not null and ${table.street} is not null and ${table.building} is not null)
  `),
]);

export const surveyParticipants = pgTable("survey_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
  personalAccountId: uuid("personal_account_id").references(() => personalAccounts.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  status: participantStatus("status").notNull(),
  verifiedSource: text("verified_source").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  eligibilityMetadata: jsonb("eligibility_metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [
  uniqueIndex("survey_participants_identity_property_unique").on(table.surveyId, table.userId, table.propertyId),
  index("survey_participants_survey_idx").on(table.surveyId),
  index("survey_participants_survey_status_idx").on(table.surveyId, table.status),
]);

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assuranceLevel: text("assurance_level").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("auth_sessions_user_idx").on(table.userId)]);

export const voteSessions = pgTable("vote_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  authSessionId: uuid("auth_session_id").notNull().references(() => authSessions.id, { onDelete: "restrict" }),
  participantId: uuid("participant_id").notNull().references(() => surveyParticipants.id, { onDelete: "restrict" }),
  status: voteSessionStatus("status").notNull().default("draft"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  ...timestamps,
});

export const votes = pgTable("votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  voteSessionId: uuid("vote_session_id").notNull().references(() => voteSessions.id, { onDelete: "restrict" }).unique(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "restrict" }),
  participantId: uuid("participant_id").notNull().references(() => surveyParticipants.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
  status: voteStatus("status").notNull().default("draft"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  submitIdempotencyKey: text("submit_idempotency_key").unique(),
  stateVersion: integer("state_version").notNull().default(1),
  canonicalPayload: jsonb("canonical_payload").$type<Record<string, unknown>>(),
  canonicalSha256: text("canonical_sha256"),
  signedSha256: text("signed_sha256"),
  signingProvider: text("signing_provider"),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("votes_one_final_vote_unique").on(table.surveyId, table.userId, table.propertyId).where(sql`${table.status} = 'submitted'`),
  uniqueIndex("votes_one_workflow_unique").on(table.surveyId, table.userId, table.propertyId).where(sql`${table.status} <> 'voided'`),
  index("votes_participant_idx").on(table.participantId),
  index("votes_survey_status_idx").on(table.surveyId, table.status),
]);

export const voteAnswers = pgTable("vote_answers", {
  voteId: uuid("vote_id").notNull().references(() => votes.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => surveyQuestions.id, { onDelete: "restrict" }),
  choice: voteChoice("choice").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.voteId, table.questionId] })]);

export const voteAutosaves = pgTable("vote_autosaves", {
  id: uuid("id").defaultRandom().primaryKey(),
  voteId: uuid("vote_id").notNull().references(() => votes.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  payloadSha256: text("payload_sha256").notNull(),
  stateVersion: integer("state_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("vote_autosaves_vote_idx").on(table.voteId)]);

export const binaryAssets = pgTable("binary_assets", {
  storageKey: text("storage_key").primaryKey(),
  contentType: text("content_type").notNull(),
  bytes: bytea("bytes").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("binary_assets_size_nonnegative", sql`${table.sizeBytes} >= 0`)]);

export const visualSignatures = pgTable("visual_signatures", {
  id: uuid("id").defaultRandom().primaryKey(),
  voteId: uuid("vote_id").notNull().references(() => votes.id, { onDelete: "restrict" }).unique(),
  storageKey: text("storage_key").notNull().references(() => binaryAssets.storageKey, { onDelete: "restrict" }),
  sha256: text("sha256").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const signatureRequests = pgTable("signature_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  voteSessionId: uuid("vote_session_id").notNull().references(() => voteSessions.id, { onDelete: "restrict" }),
  voteId: uuid("vote_id").notNull().references(() => votes.id, { onDelete: "restrict" }),
  provider: text("provider").notNull(),
  providerRequestId: text("provider_request_id"),
  documentDigest: text("document_digest").notNull(),
  status: signatureStatus("status").notNull().default("created"),
  evidenceReference: text("evidence_reference"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("signature_requests_provider_request_unique").on(table.provider, table.providerRequestId).where(sql`${table.providerRequestId} is not null`),
  uniqueIndex("signature_requests_active_vote_unique").on(table.voteId).where(sql`${table.status} in ('created', 'pending', 'verified')`),
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  voteId: uuid("vote_id").references(() => votes.id, { onDelete: "restrict" }),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "restrict" }),
  type: text("document_type").notNull(),
  status: documentStatus("status").notNull().default("pending"),
  currentVersion: integer("current_version").notNull().default(0),
  ...timestamps,
}, (table) => [
  index("documents_survey_idx").on(table.surveyId),
  index("documents_survey_created_idx").on(table.surveyId, table.createdAt),
  uniqueIndex("documents_vote_unique").on(table.voteId).where(sql`${table.voteId} is not null`),
]);

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  surveyVersion: integer("survey_version").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  sha256: text("sha256").notNull(),
  canonicalSha256: text("canonical_sha256").notNull(),
  signingProvider: text("signing_provider").notNull(),
  signingStatus: signatureStatus("signing_status").notNull(),
  verificationReference: text("verification_reference").notNull(),
  immutable: boolean("immutable").notNull().default(true),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("document_versions_document_version_unique").on(table.documentId, table.version),
  check("document_versions_version_positive", sql`${table.version} > 0`),
  check("document_versions_size_nonnegative", sql`${table.sizeBytes} >= 0`),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: text("event_type").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  subjectType: text("subject_type"),
  subjectId: uuid("subject_id"),
  requestId: text("request_id").notNull(),
  outcome: text("outcome").notNull(),
  ipHash: text("ip_hash"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_logs_request_idx").on(table.requestId),
  index("audit_logs_actor_idx").on(table.actorUserId),
  index("audit_logs_event_occurred_idx").on(table.eventType, table.occurredAt),
  check("audit_logs_outcome_valid", sql`${table.outcome} in ('success', 'failure')`),
]);

export const platformRoles = pgTable("platform_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("role_key").notNull().unique(),
  nameRu: text("name_ru").notNull(),
  descriptionRu: text("description_ru").notNull().default(""),
  system: boolean("system").notNull().default(true),
  ...timestamps,
});

export const platformPermissions = pgTable("platform_permissions", {
  key: text("permission_key").primaryKey(),
  descriptionRu: text("description_ru").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => platformRoles.id, { onDelete: "cascade" }),
  permissionKey: text("permission_key").notNull().references(() => platformPermissions.key, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })]);

export const userPlatformRoles = pgTable("user_platform_roles", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => platformRoles.id, { onDelete: "restrict" }),
  assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.roleId] }),
  index("user_platform_roles_role_idx").on(table.roleId, table.userId),
]);

export const platformAccessControls = pgTable("platform_access_controls", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  disabledByUserId: uuid("disabled_by_user_id").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason"),
  ...timestamps,
});

export const integrationRequests = pgTable("integration_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: text("request_id").notNull().unique(),
  provider: text("provider").notNull(),
  operation: text("operation").notNull(),
  status: integrationStatus("status").notNull().default("started"),
  attempts: integer("attempts").notNull().default(1),
  durationMs: integer("duration_ms"),
  errorCode: text("error_code"),
  responseReference: text("response_reference"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [
  index("integration_requests_provider_operation_idx").on(table.provider, table.operation),
  check("integration_requests_attempts_positive", sql`${table.attempts} > 0`),
]);
