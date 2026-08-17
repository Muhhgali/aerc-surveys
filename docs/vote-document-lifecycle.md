# Integrated Stage 3 vote and document lifecycle

Stage 3 is implemented on top of the Stage 2.5 PostgreSQL/session workflow. The browser never supplies canonical content, a signing status, or a final PDF.

## State and trust flow

`draft -> ready_to_sign -> signing -> signed -> submitted`; `voided` is terminal. Answers and `visual_signature` are mutable only in `draft`. PostgreSQL triggers reject invalid transitions, answer changes after the canonical lock, terminal vote updates, and updates/deletes of final binary assets and document versions.

The server loads the vote, participant/property references, survey version, ordered questions and answers from PostgreSQL. It deterministically serializes that canonical snapshot and stores its SHA-256. A `SigningProvider` request is tied to that digest. The mock adapter implements create, status, verify, cancel and finalize without pretending to be a legal eGov/Digital ID integration.

## Documents

PDFKit renders a portrait A4 voting sheet server-side with an embedded Cyrillic font, selected-answer columns, optional `visual_signature`, metadata and a QR verification link. `DocumentStorageProvider` stores immutable bytes; development and tests use PostgreSQL `binary_assets`, while a future production adapter may use object storage.

`GET /api/documents/:documentId/pdf` requires the owner session and rechecks the stored SHA-256. `/verify/:documentId` is public but exposes only protocol, creation time, document/signing status, integrity, public Document ID and hash. It never exposes the account, participant, raw signature, PDF, or internal identity attributes.

## Migration line

- `0000_production_data_model`
- `0001_regular_madelyne_pryor` (Stage 2.5 persistence/session additions)
- `0002_superb_zodiak` (integrated signing/document schema and data conversion)
- `0003_vote_document_immutability` (state and immutable-record triggers)

Automated tests cover both a fresh database and a Stage 2.5 database upgraded with an existing hash session, draft and answers.
