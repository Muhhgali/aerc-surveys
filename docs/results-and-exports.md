# Results, participants and exports

Only `submitted` votes contribute to FOR, AGAINST and ABSTAIN. Draft, signing, signed-but-not-submitted, and voided workflows are excluded.

- Eligible: `survey_participants.status = eligible`.
- Started: distinct non-voided workflows.
- Completed: submitted votes.
- Participation: `completed / eligible * 100`; zero eligible produces zero percent.

Aggregates are grouped PostgreSQL queries, not React and not one query per question. Supporting indexes cover participant and vote status plus document creation.

Participant lists return reference, property, eligibility, state/timestamps and public Document ID. Account values are masked as `••••1911` in the backend by default. Full values require `participant.pii.read` and explicit opt-in. Document detail never exposes signing payloads, tokens, base64 signatures or PDF internals.

Results and participant exports are separate and require `export.results` or `export.participants`. They are server-generated and audited. Every CSV cell is quoted, quotes are escaped, line breaks flattened, and values beginning with `=`, `+`, `-`, or `@` receive an apostrophe prefix to prevent spreadsheet formula execution.
