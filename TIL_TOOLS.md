# TIL custom tools — fork manifest

Custom tools this fork carries on top of upstream `tableau/tableau-mcp`, plus the shared files they modify. Read this before rebasing onto a new upstream release — it's the difference between a 30-minute chore and a rediscovery exercise.

Current base: **upstream v4.5.2** → tag `til-v4.5.2-r1` on branch `til-v4-rebase`.

## The 28 custom tools

Grouped by domain. All live under `src/tools/web/`.

### Projects — `src/tools/web/projects/`
- `createProject.ts`
- `updateProject.ts`
- `deleteProject.ts`

*(`listProjects.ts` is upstream — reuse as-is.)*

### Extract refresh — `src/tools/web/extractRefreshTasks/`
- `getExtractRefreshTask.ts`
- `createExtractRefreshTask.ts`
- `runExtractRefreshTask.ts`

*(`listExtractRefreshTasks.ts` and `updateCloudExtractRefreshTask.ts` are upstream — reuse as-is.)*

### Users — `src/tools/web/users/`
- `getUser.ts`
- `createUser.ts`
- `deleteUser.ts`
- `listGroupsForUser.ts`

*(`listUsers.ts` and `updateUser.ts` are upstream — reuse as-is.)*

### Groups — `src/tools/web/groups/`
- `listGroups.ts`
- `createGroup.ts`
- `updateGroup.ts`
- `deleteGroup.ts`
- `listUsersInGroup.ts`
- `addUserToGroup.ts`
- `removeUserFromGroup.ts`

### Permissions — `src/tools/web/permissions/`
- `listProjectPermissions.ts`
- `listWorkbookPermissions.ts`
- `listViewPermissions.ts`
- `listDatasourcePermissions.ts`
- `listDefaultPermissions.ts`
- `updateDefaultPermissions.ts`
- `addPermissions.ts`
- `deletePermission.ts`
- `deleteDefaultPermission.ts`

### Workbook extraction — `src/tools/web/workbooks/`
- `unpackTwbx.ts` — unzips a `.twbx` to a temp dir. Uses `adm-zip` (dependency added by this fork).
- `readExtractedFile.ts` — reads a file from that temp dir. Path-safety guard in the tool.

*(Also relevant upstream reuse: `deleteContent.ts` is polymorphic and handles `'permission'` deletes once the kind union is extended — see below. `downloadWorkbook.ts` is upstream and reused as-is.)*

## Shared files this fork patches

These are the choke points that generate merge conflicts on rebase. Any upstream change to them requires manual reconciliation.

### 1. `src/tools/web/_lib/mutationGuard.ts`
`MutationTarget.kind` union is extended. Current state:
```ts
kind: 'datasource' | 'workbook' | 'extract-refresh-task' | 'user' | 'project' | 'group' | 'permission';
```
Upstream ships with only the first three. The last four are TIL additions. `targetKindHint(tool)` also has entries for the new kinds.

### 2. `src/tools/web/_lib/auditRecord.ts`
The zod enum for audited target kinds mirrors the mutationGuard union:
```ts
kind: z.enum(['datasource', 'workbook', 'extract-refresh-task', 'user', 'project', 'group', 'permission'])
```

### 3. `src/server/oauth/scopes.ts`
Both `McpScope` and the Tableau server scope union are extended with TIL-relevant entries:

- **McpScope additions**: `tableau:mcp:users:write`, `tableau:mcp:groups:read`, `tableau:mcp:groups:write`, `tableau:mcp:permissions:read`, `tableau:mcp:permissions:write`, `tableau:mcp:permissions:delete`, `tableau:mcp:workbook:extract`.
- **Tableau scope additions**: `tableau:projects:create/update/delete`, `tableau:groups:create/update/delete`, `tableau:users:create/delete`, `tableau:permissions:read/update/delete`, `tableau:tasks:create/run`.
- **`DEFAULT_SCOPES_SUPPORTED`** also lists the new McpScope entries so dynamic client registration advertises them.

### 4. `src/tools/web/tools.ts`
Registers all 28 tools with the server. Each tool needs a factory entry here. Order doesn't matter, grouping does.

### 5. `src/tools/web/toolName.ts`
Adds 28 entries to the tool-name enum used for validation, feature-gate checks, and telemetry.

## Additional runtime dependencies

Added by the workbook-extraction port. Confirm both are present in `package.json` / `package-lock.json` after any rebase:

- `adm-zip` (runtime)
- `@types/adm-zip` (dev)

## Test files touched by TIL ports

If tests fail after a rebase, these files most often need a look:

- `src/tools/web/workbooks/unpackTwbx.test.ts` — Zip Slip payload construction mutates `entryName` after `addFile()` because adm-zip sanitizes leading `../`.
- `src/server/passthroughAuthMiddleware.test.ts` — allowlist includes `unpack-twbx` and `read-extracted-file` (pure-filesystem tools that never touch Tableau REST).
- `src/overridableConfig.test.ts` — the `workbook` group's expected expansion includes `unpack-twbx` and `read-extracted-file`.
- `src/tools/web/groups/listGroups.test.ts` — filter-parsing errors are surfaced as tool errors (parser sits *inside* `logAndExecute`, matching upstream `listUsers`).

## Rebase flow

When upstream cuts a new tag (e.g. `v4.6.0`):

1. Fetch tags:
   ```bash
   git fetch upstream --tags   # or: git fetch origin --tags if using a single origin
   ```
2. Cut a fresh branch from the tag:
   ```bash
   git checkout -b til-v4.6-rebase v4.6.0
   ```
3. Cherry-pick or rebase the TIL commits from `til-v4-rebase`. The port commits are cleanly grouped — you can identify them by:
   - The three merge commits from the parallel port branches (`port/projects-extractrefresh`, `port/users-groups`, `port/permissions-workbooks`), or
   - The subsequent fix-up commits touching the 5 shared files above.
4. Expect merge conflicts on the 5 shared files. Resolve by **unioning** the enums / registrations — never dropping TIL entries.
5. Reinstall deps to make sure `adm-zip` is still in `package-lock.json`:
   ```bash
   npm install --engine-strict=false
   ```
6. Run the full test suite:
   ```bash
   npm test
   ```
7. Build a Docker image locally and smoke-test against a Tableau site (list-projects + list-groups + list-project-permissions is the canary trio — proves web tools, admin gate, and the permissions port all work).
8. Cut an annotated tag on the new head:
   ```bash
   git tag -a til-v4.6.0-r1 -m "TIL fork rebased onto upstream v4.6.0"
   git push origin til-v4.6-rebase --tags
   ```
9. Open a PR on `TheInformationLab/til-tableau-mcp` bumping `ref:` in `.github/workflows/docker-build.yml` to the new SHA.

## Cost by upstream release type

- **Patch (v4.5.3)** — usually no conflicts. Fast-forward rebase, run tests, tag.
- **Minor (v4.6.0)** — probable conflicts on `tools.ts` / `toolName.ts` if upstream added tools. Union the lists.
- **Major (v5.0.0)** — anything is possible. If upstream restructures `src/tools/` (as v4 did) or renames the `WebTool` / `guardMutation` APIs, expect a full re-port. Use the v1 → v4 approach: three parallel worktrees for projects+extract-refresh / users+groups / permissions+workbooks, merge back with union-resolution on the 5 shared files.

## When to stop maintaining this fork

Two conditions make this manifest obsolete:

- Upstream exposes a tool plugin SDK — register TIL tools without patching core files. Migrate once, delete this file.
- The TIL tools that make sense generically (project CRUD, group management) get merged upstream and the remainder shrinks below a maintenance threshold.

Until then, treat every upstream release as a scheduled chore, not an emergency.
