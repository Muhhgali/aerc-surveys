# Platform RBAC

Platform administration is separate from `organization_members.role`.

## Model

- `platform_roles`: stable system roles.
- `platform_permissions`: stable capabilities.
- `role_permissions`: many-to-many capability mapping.
- `user_platform_roles`: multiple roles per user, with assigning actor.
- `platform_access_controls`: platform-only disable state, preserving owner-application access.

Roles are `super_admin`, `admin`, `survey_manager`, `operator`, `auditor`, and `viewer`. Application decisions use permissions such as `survey.publish`, `participant.pii.read`, `document.pdf.read`, `audit.read`, and `role.manage`, not role-name conditionals.

`super_admin` and `admin` have the full current permission set. Managers own survey lifecycle and exports. Operators edit drafts but cannot publish. Auditors read results, documents and audit. Viewers receive minimum read-only access.

`requireAdminPermission()` resolves the current database session, active user, non-disabled platform access, roles, and permissions on every request. Mutations also enforce same-origin requests and Zod validation.

Role changes are transactional and audited. PostgreSQL triggers reject removing the last active `super_admin`, disabling their platform access, or blocking their user while no other active super administrator remains.

Participant endpoints return masked account values unless both `participant.pii.read` and an explicit PII request are present. The standard UI never requests PII. No audit-delete endpoint exists.
