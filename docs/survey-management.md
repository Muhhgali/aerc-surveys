# Survey management and publication

## Lifecycle

```text
draft -> scheduled -> active -> closed -> archived
draft ----------------> active
scheduled --------------------> closed
```

`draft -> active` is selected when start is not in the future; otherwise publication creates `scheduled`. Reverse transitions are rejected.

Closing is strict: no start, draft continuation/autosave, signing, submission, or start/resume POST is accepted after close. Submitted votes and finalized documents remain readable and verifiable. Archive never deletes votes, snapshots, documents or audit.

## Drafts and publication

A draft has RU/KZ title and description, protocol, period, questions, required flags, stable positions, and explicit targets. `lock_version` increments on content, question and target mutations; stale writes return HTTP 409.

Publish transactionally validates protocol, bilingual fields, dates, at least one bilingual question, unique positions, and targeting. It creates a deterministic `survey_versions.snapshot` with SHA-256, materializes eligible participants from the local property/account read model, changes status, and writes `SURVEY_PUBLISHED`.

Published survey fields, questions, targets and version rows are protected by PostgreSQL triggers. Existing Stage 3 canonical vote payloads, hashes, PDF bytes and verification references never read mutable draft state.

Stage 4 exposes no destructive published amendment. A future amendment must create a new explicit survey version.

## Targeting and import

Targets support building, one or more properties, organization and personal account. Publication expands them against the local trusted read model. No generic JSON rule engine or invented AERC API is used.

CSV account import is limited to 256 KiB and 5,000 rows. It strips BOM, bounds fields, reports duplicates and unresolved accounts, previews resolved IDs, and requires confirmation. CSV content is data only.
