import "server-only";

import { AuthenticationService } from "@/src/application/authentication/authentication-service";
import { SessionService } from "@/src/application/session/session-service";
import { OrganizationService } from "@/src/application/organization/organization-service";
import { PropertyService } from "@/src/application/property/property-service";
import { VoteService } from "@/src/application/voting/vote-service";
import { VoteLifecycleService } from "@/src/application/voting/vote-lifecycle-service";
import { VisualSignatureService } from "@/src/application/voting/visual-signature-service";
import { DocumentLifecycleService } from "@/src/application/documents/document-lifecycle-service";
import { AdminService } from "@/src/application/admin/admin-service";
import { loadProviderConfig } from "@/src/infrastructure/config/provider-config";
import { getDatabaseClient } from "@/src/infrastructure/database/client";
import {
  PostgresAuditRepository,
  PostgresAuthenticationRepository,
  PostgresOrganizationMembershipRepository,
  PostgresPersonalAccountRepository,
  PostgresVotingRepository,
} from "@/src/infrastructure/database/postgres-repositories";
import { PostgresAdminRepository } from "@/src/infrastructure/database/postgres-admin-repository";
import { consoleLogger } from "@/src/infrastructure/logging/structured-logger";
import { PdfKitVotingSheetRenderer } from "@/src/infrastructure/documents/pdfkit-voting-sheet-renderer";
import { createProviderRegistry } from "@/src/infrastructure/providers/registry";
import { PostgresSessionStore } from "@/src/infrastructure/session/postgres-session-store";

/** Server composition root. Real database/provider adapters are intentionally not implemented yet. */
export function createApplication() {
  const config = loadProviderConfig();
  if (config.sessionStore !== "database") {
    throw new Error("This backend requires SESSION_STORE=database; in-memory sessions are test-only");
  }
  const database = getDatabaseClient();
  const providers = createProviderRegistry(config, consoleLogger, database);
  const accounts = new PostgresPersonalAccountRepository(database);
  const identities = new PostgresAuthenticationRepository(database);
  const votingRepository = new PostgresVotingRepository(database);
  const membershipRepository = new PostgresOrganizationMembershipRepository(database);
  const audit = new PostgresAuditRepository(database);
  const adminRepository = new PostgresAdminRepository(database);
  const sessions = new SessionService(new PostgresSessionStore(database), config.sessionTtlSeconds);
  const authentication = new AuthenticationService(providers.identity, identities, sessions);
  const properties = new PropertyService(providers.property, accounts);
  const voting = new VoteService(votingRepository);
  const lifecycle = new VoteLifecycleService(votingRepository, votingRepository);
  const visualSignatures = new VisualSignatureService(votingRepository, votingRepository, providers.documentStorage);
  const documents = new DocumentLifecycleService(lifecycle, votingRepository, providers.signing, providers.documentStorage, new PdfKitVotingSheetRenderer());
  const organizations = new OrganizationService(membershipRepository);
  const admin = new AdminService(adminRepository);
  return { config, providers, database, sessions, authentication, properties, voting, lifecycle, visualSignatures, documents, organizations, audit, admin, adminRepository };
}
