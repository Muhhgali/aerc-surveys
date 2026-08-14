import "server-only";

import { SessionService } from "@/src/application/session/session-service";
import { OrganizationService } from "@/src/application/organization/organization-service";
import { PropertyService } from "@/src/application/property/property-service";
import { VoteService } from "@/src/application/voting/vote-service";
import { loadProviderConfig } from "@/src/infrastructure/config/provider-config";
import { getDatabaseClient } from "@/src/infrastructure/database/client";
import {
  PostgresAuditRepository,
  PostgresOrganizationMembershipRepository,
  PostgresPersonalAccountRepository,
  PostgresVotingRepository,
} from "@/src/infrastructure/database/postgres-repositories";
import { consoleLogger } from "@/src/infrastructure/logging/structured-logger";
import { createProviderRegistry } from "@/src/infrastructure/providers/registry";
import { PostgresSessionStore } from "@/src/infrastructure/session/postgres-session-store";

/** Server composition root. Real database/provider adapters are intentionally not implemented yet. */
export function createApplication() {
  const config = loadProviderConfig();
  if (config.sessionStore !== "database") {
    throw new Error("This backend requires SESSION_STORE=database; in-memory sessions are test-only");
  }
  const providers = createProviderRegistry(config, consoleLogger);
  const database = getDatabaseClient();
  const accounts = new PostgresPersonalAccountRepository(database);
  const votingRepository = new PostgresVotingRepository(database);
  const membershipRepository = new PostgresOrganizationMembershipRepository(database);
  const audit = new PostgresAuditRepository(database);
  const sessions = new SessionService(new PostgresSessionStore(database), config.sessionTtlSeconds);
  const properties = new PropertyService(providers.property, accounts);
  const voting = new VoteService(votingRepository);
  const organizations = new OrganizationService(membershipRepository);
  return { config, providers, database, sessions, properties, voting, organizations, audit };
}
