# Administrative console

Stage 4 adds a desktop-first administrative product at `/admin`. It is separate from the mobile owner application, but uses the same application and database model.

## Entry and session

In development/test, `/admin/login` calls `/api/dev/admin-session`. That route is available only when mock authentication is explicitly enabled and `APP_ENV` is not `production`. The mock identity is resolved through `IdentityProvider`, `external_identities`, `users`, a database `auth_session`, and platform RBAC. There is no URL flag or browser-stored role.

Every admin page and every `/api/admin/*` loader, mutation and export independently validates the trusted session and required capability. Hiding a UI control is never the authorization decision.

## Pages

- `/admin`: real survey, participation, document, and audit metrics.
- `/admin/surveys`: server search, filters and pagination.
- `/admin/surveys/new` and `/edit`: bilingual draft, questions, ordering, preview, targeting and CSV account import.
- Survey detail, results and participants: lifecycle controls, database aggregates and masked data.
- `/admin/documents`: the Stage 3 immutable document registry and PDF authorization.
- `/admin/audit`: read-only, filtered, paginated event viewer.
- `/admin/users`: platform role assignment/revocation and administrative access disablement.
- `/admin/settings`: effective capabilities; provider secrets are never edited in the browser.

Potentially large collections use bounded server-side pagination. Search is parameterized by `postgres.js`; the browser never loads whole tables for local filtering.

The survey preview reads the persisted draft and its questions and never creates a vote. Ordering has explicit move-up and move-down controls. Draft updates use `lock_version`; a stale save receives `concurrency_conflict` instead of overwriting another administrator.
