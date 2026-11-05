# TIL custom tools — fork manifest

Custom tools this fork carries on top of upstream `tableau/tableau-mcp`, plus the shared files they modify. Read this before rebasing onto a new upstream release — it's the difference between a 30-minute chore and a rediscovery exercise.

Current base: **upstream v5.6.1** → tag `til-v5.6.1-r1` on branch `main`. (The old v1.13.10 fork tip is preserved on `archive/v1.13.10`.)

Tool counts at this base: upstream ships 55 web tools, the fork adds 28, total **83**.

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
- `unpackTwbx.ts` — unzips a `.twbx` to a temp dir. Uses `adm-zip` (dependency added by this fork). `extractTo` is constrained to `TEMP_BASE`.
- `readExtractedFile.ts` — reads a file from that temp dir. Path-safety guard in the tool.

### Dropped at the v5.6.1 rebase
- `validateUploadAndPublishWorkbook.ts` — superseded by upstream's `publish-workbook` / `publish-datasource` / `move-workbook`. Do not reinstate.

## Shared files this fork patches

**There are 20, not 5.** The pre-v5 version of this manifest listed only the five tool-registry files and cost a rediscovery exercise on the v5.6.1 rebase. The full set:

### Tool registry and scopes
1. `src/tools/web/toolName.ts` — 28 names in `webToolNames`, plus `permissions` in `webToolGroupNames` and the `webToolGroups` entries.
2. `src/tools/web/tools.ts` — 28 factory registrations.
3. `src/server/oauth/scopes.ts` — the big one. `McpScope` + `TableauApiScope` unions, `DEFAULT_SCOPES_SUPPORTED`, the 28 `toolScopeMap` entries, **and** the admin-tool deletions inside `getEnabledToolNames`.
4. `src/tools/web/_lib/mutationGuard.ts` — `MutationTarget.kind` union extended with `'user' | 'project' | 'group' | 'permission'`; `targetKindHint(tool)` entries.
5. `src/tools/web/_lib/auditRecord.ts` — zod enum mirroring that union.

### SDK layer
6. `src/sdks/tableau/apis/projectsApi.ts`
7. `src/sdks/tableau/apis/tasksApi.ts`
8. `src/sdks/tableau/apis/usersApi.ts`
9. `src/sdks/tableau/apis/groupsApi.ts` *(fork-only file)*
10. `src/sdks/tableau/apis/permissionsApi.ts` *(fork-only file)*
11. `src/sdks/tableau/methods/projectsMethods.ts`
12. `src/sdks/tableau/methods/tasksMethods.ts`
13. `src/sdks/tableau/methods/usersMethods.ts`
14. `src/sdks/tableau/restApi.ts` — `groupsMethods` / `permissionsMethods` getters + imports.
15. `src/sdks/tableau/types/permissions.ts` — **add/add conflict risk.** Upstream created a file at this path in v5 for workbook-publish types. The fork's types now live alongside them; `capabilitySchema` is shared and deliberately permissive (`mode: z.string()`).
16. `src/sdks/tableau/types/extractRefreshTask.ts`

### Cross-cutting
17. `src/tools/web/resourceAccessChecker.ts`
18. `src/restApiInstance.ts` — **new at v5.** The `JwtScopes` union must stay a superset of `TableauApiScope`; any scope in one and not the other breaks typecheck across *every* tool, not just the fork's.
19. `src/activityLog/objects.ts` — **new at v5.** A `Record<WebToolName, ...>`, so a new tool does not compile until classified here.
20. `src/utils/tempPaths.ts` *(fork-only file)* — renamed from `fileSystem.ts` at the v5.6.1 rebase because upstream created an unrelated `src/utils/fileSystem.ts`. Do not rename it back.

## v5 invariants the fork must satisfy

Upstream added enforcement that the ported tools do not get for free. All of these were real work on the v5.6.1 rebase:

- **`minRequiredRole` is mandatory** on every `WebTool`. The fork uses `MIN_ADMIN_SITE_ROLE` for the 23 admin-gated tools and `SiteRole.VIEWER` for the 5 permissions *read* tools.
- **Admin gating is `isAdminToolsEnabled(config)`, not `config.adminToolsEnabled`.** Upstream's helper is env var OR feature flag; the bare field is env var only. Use `disabled: new Provider(async () => !(await isAdminToolsEnabled(config)))`.
- **Path params must use `pathParam()`** from `src/sdks/routeSafety/ids.ts` — `siteId` and non-LUID vocabulary (`resourceType`, `granteeType`, `capabilityName`, `capabilityMode`) as `'segment'`, agent-supplied IDs as the default `'luid'`. Enforced by `src/sdks/routeSafety/pathParams.test.ts`, which also requires every endpoint module to be **registered in its `modules` map** — register `groupsApi.ts` and `permissionsApi.ts` there.
- **Zodios clients must use `createGuardedZodios(...)`** from `src/sdks/routeSafety/zodios.ts`, not `new Zodios(...)`. Enforced by an eslint `no-restricted-syntax` rule.
- **Tools reaching `getConfigWithOverrides()` must declare `tableau:mcp_site_settings:read`.** Enforced by `mcpSiteSettingsScope.invariant.test.ts`. The paginated group tools hit this.

## Upstream tests the fork must edit

These encode upstream-only assumptions that the fork legitimately breaks. Expect to re-apply on every rebase:

- `src/server.web.test.ts` — `adminToolNames` is a hardcoded list; add the fork's 23 admin tools.
- `src/server/oauth/scopes.test.ts` and `src/server/oauth/authMiddleware.test.ts` — upstream treats `tableau:permissions:read` as strictly optional (publish-workbook's post-publish disclosure). In the fork it is **required**, because the permissions read tools declare it and `getEnabledToolNames` leaves them enabled for every authenticated caller. Consequence worth knowing: a client that withholds `tableau:permissions:read` fails `initialize` with `insufficient_scope`.
- `src/overridableConfig.test.ts` — the `workbook` group expansion includes `unpack-twbx` and `read-extracted-file`.
- `src/tools/web/workbooks/unpackTwbx.test.ts` — Zip Slip payload mutates `entryName` after `addFile()` because adm-zip sanitizes leading `../`.
- `src/server/passthroughAuthMiddleware.test.ts` — allowlist includes the two filesystem-only tools.

Also: `ShapeOutput` (MCP SDK) types an optional zod field as `key: T | undefined`, not `key?: T`. Test helpers must pass **every** key explicitly, even when undefined.

## Additional runtime dependencies

Confirm both survive any rebase (`package.json` + `package-lock.json`):

- `adm-zip` (runtime)
- `@types/adm-zip` (dev)

## Rebase flow

`main` always tracks the latest upstream tag plus TIL ports on top.

1. `git fetch upstream --tags`
2. Branch from the new tag: `git checkout -b rebase/vX.Y.Z vX.Y.Z`
3. `git merge --squash main`. **Prefer this over replaying the port commits** — it resolves the conflict set once instead of once per commit. The v4.5.2 → v5.6.1 jump (154 upstream commits) produced 13 conflicted files this way.
4. Resolve by **unioning** enums and registrations — never drop TIL entries. Watch for scopes both sides add (`tableau:permissions:read` is in both); dedupe rather than listing twice.
5. `npm install --engine-strict=false` (needs Node >= 22.7.5), then `npx tsc --noEmit`, `npm run lint:fix`, `npm test`, `npm run build`.
6. Smoke-test: `list-projects` + `list-groups` + `list-project-permissions` is the canary trio — it proves web tools, the admin gate, and the permissions port.
7. Fast-forward `main`, tag `til-vX.Y.Z-r1`, `git push origin main --force-with-lease --tags`. (Force-push is expected; `main` is a rebased line.)
8. Open a PR on `TheInformationLab/til-tableau-mcp` bumping `ref:` in `.github/workflows/docker-build.yml` to the new SHA.

## Cost by upstream release type

- **Patch** — usually no conflicts. Fast-forward, test, tag.
- **Minor** — probable conflicts on `tools.ts` / `toolName.ts` / `scopes.ts` if upstream added tools. Union the lists.
- **Major** — *not* automatically a full re-port. The v4.5.2 → v5.6.1 jump kept the `WebTool` factory signature and `guardMutation` API intact (the latter only gained an optional `precondition`), so all 28 tools survived unchanged in substance. The real cost was the new invariants listed above, not rewriting tools. Budget for enforcement catch-up, not a rewrite — and check whether upstream added any new `Record<WebToolName, ...>` map that will not compile until the fork's tools are classified.

## When to stop maintaining this fork

- Upstream exposes a tool plugin SDK — register TIL tools without patching core files. Migrate once, delete this file.
- The generically useful TIL tools (project CRUD, group management) land upstream and the remainder shrinks below a maintenance threshold.

Until then, treat every upstream release as a scheduled chore, not an emergency.
