# Porting Guide: Rebasing TIL Custom Tools onto upstream v4.5.2

This document is the working plan for lifting the 35 custom tools added to the fork
(`origin/main`, v1.13.10 line) onto the new upstream v4.5.2 architecture on branch
`til-v4-rebase`. It is written so a porting agent can pattern-match without re-reading
upstream from scratch.

Every fork tool file path shown here refers to a blob on `origin/main` — read them with
`git show origin/main:<path>`. Every target path refers to a file to be written on the
current `til-v4-rebase` branch.

---

## 1. v4 architecture summary

### 1.1 Layered split

v4 splits tools into two top-level worlds:

- `src/tools/web/` — MCP tools that call the Tableau REST API. All fork tools belong here.
- `src/tools/desktop/` — a separate MCP server that talks to a local Tableau Desktop
  agent. Not relevant for this port.

Shared base classes live in `src/tools/tool.ts` and `src/tools/toolContext.ts`. Web
specializations live in `src/tools/web/tool.ts` and `src/tools/web/toolContext.ts`.

### 1.2 Key differences from the fork's v1 pattern

| Concern                     | Fork (v1.13.10)                                                                                            | Upstream v4.5.2                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Base class                  | `Tool<Args>` from `src/tools/tool.ts`                                                                      | `WebTool<Args>` from `src/tools/web/tool.ts`                                                                                                |
| Server type                 | `Server` (single implementation)                                                                           | `WebMcpServer` (from `src/server.web.ts`)                                                                                                   |
| Tool factory signature      | `(server: Server) => Tool<...>`                                                                            | `(server: WebMcpServer) => WebTool<...>`                                                                                                    |
| Callback extra              | `{ requestId, authInfo, signal }` — tools call `getConfig()` inline                                        | `extra: TableauWebRequestHandlerExtra` — carries `config`, `getConfigWithOverrides()`, `getSiteLuid()`, `getUserLuid()`, `tableauAuthInfo`. |
| REST call helper            | `useRestApi({ config, requestId, server, jwtScopes, signal, authInfo: getTableauAuthInfo(authInfo), … })`  | `useRestApi({ ...extra, jwtScopes: tool.requiredApiScopes, callback })` — spreads the extra straight through.                               |
| Required scopes             | Inline literal e.g. `jwtScopes: ['tableau:content:read']`                                                  | Declared in `src/server/oauth/scopes.ts` `toolScopeMap` and read via `tool.requiredApiScopes`.                                              |
| Bounded context             | `config.boundedContext`                                                                                    | `(await extra.getConfigWithOverrides()).boundedContext` (site-scoped override support).                                                     |
| Error return                | Custom `type: '…'` error objects + `getErrorText`                                                          | Typed `McpToolError` subclasses (see `src/errors/mcpToolError.ts`) returned via `.toErr()`.                                                 |
| Result shape                | `constrainSuccessResult: (r) => ConstrainedResult<T>` on `logAndExecute`                                   | Same, but `ConstrainedResult` type is `import from '../tool.js'` (i.e. `src/tools/web/tool.ts`).                                            |
| Annotations                 | Optional (`readOnlyHint?`, `openWorldHint?`)                                                               | `Required<ToolAnnotations>` — all four flags MUST be set (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).            |
| Admin gating                | Inline `siteRole` checks or none                                                                           | Central `assertAdmin(restApi, extra)` from `src/tools/web/adminGate.ts` + feature flag `config.adminToolsEnabled`.                          |
| Destructive tool contract   | Simple `confirm: z.boolean().refine(...)` param                                                            | Two-phase preview→confirm via `guardMutation({...})` in `src/tools/web/_lib/mutationGuard.ts`, with `EvidenceStrategy` gating.              |
| Pagination                  | `paginate({...})` from `src/utils/paginate.ts` — loops all pages                                           | `getPage({...})` — fetches one page at a time (client-controlled `pageNumber`), plus `getPageExceedsLimitMessage`.                          |
| Registration                | `src/tools/tools.ts` exports `toolFactories = [...]`                                                       | `src/tools/web/tools.ts` exports `webToolFactories = [...]` and `src/tools/desktop/tools.ts` exports desktop ones.                          |
| Tool name registry          | `src/tools/toolName.ts` — flat array                                                                       | `src/tools/web/toolName.ts` — `webToolNames`, `webToolGroupNames`, `webToolGroups`. New names must be added here AND in `toolScopeMap`.     |
| Resource access checker    | `src/tools/resourceAccessChecker.ts` — call sig `isXAllowed({ workbookId, restApiArgs: { config, requestId, server, signal } })` | `src/tools/web/resourceAccessChecker.ts` — call sig `isXAllowed({ workbookId, extra })`.                                                    |
| Test mock                   | Ad-hoc                                                                                                     | `getMockRequestHandlerExtra()` from `src/tools/web/toolContext.mock.ts`.                                                                    |

### 1.3 Template tool (based on `src/tools/web/projects/listProjects.ts`)

```ts
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { PageExceedsLimitError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { WebMcpServer } from '../../../server.web.js';
import { getPage, getPageExceedsLimitMessage, MAX_PAGE_SIZE } from '../../../utils/paginate.js';
import { ConstrainedResult, WebTool } from '../tool.js';

const paramsSchema = {
  filter: z.string().optional(),
  pageNumber: z.number().int().gt(0).optional(),
  limit: z.number().int().gt(0).max(MAX_PAGE_SIZE).optional(),
};

export const getListFoosTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const tool = new WebTool({
    server,
    name: 'list-foos', // must be added to webToolNames + toolScopeMap
    description: `...`,
    paramsSchema,
    annotations: {
      title: 'List Foos',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ filter, pageNumber, limit }, extra): Promise<CallToolResult> => {
      const configWithOverrides = await extra.getConfigWithOverrides();
      const maxResultLimit = configWithOverrides.getMaxResultLimit(tool.name);

      return await tool.logAndExecute({
        extra,
        args: { filter, pageNumber, limit },
        callback: async () => {
          const msg = getPageExceedsLimitMessage({ pageNumber, maxResultLimit });
          if (msg) return new PageExceedsLimitError(msg).toErr();

          return new Ok(
            await useRestApi({
              ...extra,
              jwtScopes: tool.requiredApiScopes,
              callback: async (restApi) =>
                await getPage({
                  pageNumber,
                  limit,
                  maxResultLimit,
                  getDataFn: async ({ pageSize, pageNumber }) => {
                    const { pagination, foos: data } = await restApi.foosMethods.listFoos({
                      siteId: restApi.siteId,
                      filter,
                      pageSize,
                      pageNumber,
                    });
                    return { pagination, data };
                  },
                }),
            }),
          );
        },
        constrainSuccessResult: (page) => {
          // apply BoundedContext filtering here, then:
          return { type: 'success', result: page };
        },
      });
    },
  });

  return tool;
};
```

### 1.4 Template test (based on `src/tools/web/projects/listProjects.test.ts`)

Key patterns:

- `vi.mock('../../../restApiInstance.js', () => ({ useRestApi: vi.fn().mockImplementation(async ({ callback }) => callback({ …stubbedRestApi, siteId: 'test-site-id' })) }));`
- Build the tool via `getListFoosTool(new WebMcpServer())` and invoke it with
  `await Provider.from(tool.callback)` + `getMockRequestHandlerExtra()`.
- To vary bounded context, override `extra.getConfigWithOverrides = vi.fn().mockResolvedValue(new OverridableConfig({...}))`.

### 1.5 Destructive-tool contract (preview → confirm)

Any mutation that would delete or overwrite content MUST route through
`guardMutation()` (`src/tools/web/_lib/mutationGuard.ts`). Read
`updateUser.ts` for a two-phase example using `RegistryEvidence` (nonce token)
and `confirmDeleteContent.ts` for polymorphic `AllEvidence([TagEvidence, AppApprovalEvidence])`.
`guardMutation` covers admin-gate, target resolution, evidence establish/verify,
and audit-record emission. Do NOT re-invent this per tool.

For fork tools that just take `confirm: z.boolean().refine(v => v === true)`, the
port either (a) drops the flag and adopts `RegistryEvidence`, or (b) picks `mode:
'confirm-only'` if the destructive gesture already carries strong intent (rare).
Prefer (a).

### 1.6 SDK layer

Fork adds these SDK modules that upstream v4 does not have — they must be ported
alongside the tools:

- `src/sdks/tableau/methods/permissionsMethods.ts` + `src/sdks/tableau/apis/permissionsApi.ts` + `src/sdks/tableau/types/permissions.ts`.
- `src/sdks/tableau/methods/groupsMethods.ts` + `src/sdks/tableau/apis/groupsApi.ts`.
- Extensions to `projectsMethods.ts` / `projectsApi.ts` for create/update/delete.
- Extensions to `usersMethods.ts` / `usersApi.ts` for create/get/delete/listGroupsForUser.
- Extensions to `tasksMethods.ts` (or a new `extractRefreshMethods.ts`) for
  `getExtractRefreshTask`, `createExtractRefreshTask`, `runExtractRefreshTask`.
  Upstream already has `listExtractRefreshTasks`, `updateCloudExtractRefreshTask`,
  and `deleteExtractRefreshTask`.
- Wire each new methods class into `src/sdks/tableau/restApi.ts` (see fork's
  restApi.ts for the pattern).

All SDK modules extend `AuthenticatedMethods` and are constructed with
`new Zodios(baseUrl, xxxApis, { axiosConfig })`.

### 1.7 Registration checklist per new tool

For each new tool, in addition to the tool file + test, the porter must edit:

1. `src/tools/web/tools.ts` — import and add to `webToolFactories`.
2. `src/tools/web/toolName.ts` — add the tool name literal to `webToolNames`, and
   optionally add it to a `webToolGroups` group.
3. `src/server/oauth/scopes.ts` — add an entry to `toolScopeMap` with `mcp` and
   `api` scope sets. If the tool is admin-only, also add a `enabledTools.delete(...)`
   line inside the `if (!config.adminToolsEnabled)` block of `getEnabledToolNames`.

Failing to do (2) or (3) causes the tool to not register or to be rejected at
OAuth scope validation.

---

## 2. Per-domain porting plans

Fork blob paths are read with `git show origin/main:<path>`. Legend for the
Action column: **reuse** = keep upstream tool as-is; **extend** = upstream has a
partial version, add missing behaviour; **port** = no upstream equivalent, write
fresh under new structure; **rewrite** = fork behaviour materially conflicts with
upstream, needs a design decision before code moves.

### 2.1 Projects (5 fork tools → 4 tools; fork already dropped `get-project`)

| Fork tool          | Fork source                              | Upstream equivalent                       | Action | Target path                                  | Notes                                                                                                                                                                             |
| ------------------ | ---------------------------------------- | ----------------------------------------- | ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list-projects`    | `src/tools/projects/listProjects.ts`     | `src/tools/web/projects/listProjects.ts`  | reuse  | (existing)                                   | Upstream is superset: same fields + `createdAt` filter. No port required unless the fork description text is preferred. Filter utils identical semantics — reuse upstream's.       |
| `create-project`   | `src/tools/projects/createProject.ts`    | none                                      | port   | `src/tools/web/projects/createProject.ts`    | Adopt `assertAdmin` + `guardMutation` (mode: `confirm-only` OR just admin gate — create is not usually destructive). Add SDK: `projectsMethods.createProject`.                     |
| `update-project`   | `src/tools/projects/updateProject.ts`    | none                                      | port   | `src/tools/web/projects/updateProject.ts`    | Uses `resourceAccessChecker` on the fork. Port with v4's checker (call `isProjectAllowed`… but note: v4 checker has no `isProjectAllowed` method — must be added, see §3 below).   |
| `delete-project`   | `src/tools/projects/deleteProject.ts`    | none (v4 has generic `delete-content` for workbooks/datasources only) | port | `src/tools/web/projects/deleteProject.ts` | Fork uses a boolean confirm flag; port to `guardMutation({ mode: 'preview-confirm', evidence: new RegistryEvidence() })`. Add SDK: `projectsMethods.deleteProject`. |

### 2.2 Users (6 fork tools)

| Fork tool             | Fork source                             | Upstream equivalent                    | Action  | Target path                                 | Notes                                                                                                                                                                    |
| --------------------- | --------------------------------------- | -------------------------------------- | ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list-users`          | `src/tools/users/listUsers.ts`          | `src/tools/web/users/listUsers.ts`     | reuse   | (existing)                                  | Upstream is admin-gated + configured. Fork has no admin gate. Prefer upstream.                                                                                            |
| `update-user`         | `src/tools/users/updateUser.ts`         | `src/tools/web/users/updateUser.ts`    | reuse   | (existing)                                  | Upstream implements two-phase preview→confirm via `guardMutation` + `RegistryEvidence`. Materially safer than fork's version. Fork also allowed changing `fullName`/`email` — those fields are dropped in upstream and not worth re-adding. |
| `get-user`            | `src/tools/users/getUser.ts`            | none                                   | port    | `src/tools/web/users/getUser.ts`            | Small read-only tool. Use `restApi.usersMethods.queryUserOnSite`. Admin-gated + `adminToolsEnabled` flag.                                                                 |
| `create-user`         | `src/tools/users/createUser.ts`         | none                                   | port    | `src/tools/web/users/createUser.ts`         | SDK: needs `usersMethods.createUser` (fork already implements it).                                                                                                        |
| `delete-user`         | `src/tools/users/deleteUser.ts`         | none                                   | port    | `src/tools/web/users/deleteUser.ts`         | Destructive — wrap in `guardMutation({ mode: 'preview-confirm', evidence: new RegistryEvidence() })`. SDK: `usersMethods.deleteUser`.                                     |
| `list-groups-for-user`| `src/tools/users/listGroupsForUser.ts`  | none                                   | port    | `src/tools/web/users/listGroupsForUser.ts`  | Read-only. SDK: `usersMethods.listGroupsForUser`.                                                                                                                          |

### 2.3 Groups (7 fork tools)

Upstream v4 has NO groups tools or SDK. Full port for all 7 + SDK layer.

| Fork tool                  | Fork source                                 | Upstream | Action | Target path                                     | Notes                                                                       |
| -------------------------- | ------------------------------------------- | -------- | ------ | ----------------------------------------------- | --------------------------------------------------------------------------- |
| `list-groups`              | `src/tools/groups/listGroups.ts`            | none     | port   | `src/tools/web/groups/listGroups.ts`            | Also port `src/tools/groups/groupsFilterUtils.ts` → `src/tools/web/groups/groupsFilterUtils.ts`. |
| `create-group`             | `src/tools/groups/createGroup.ts`           | none     | port   | `src/tools/web/groups/createGroup.ts`           |                                                                             |
| `update-group`             | `src/tools/groups/updateGroup.ts`           | none     | port   | `src/tools/web/groups/updateGroup.ts`           |                                                                             |
| `delete-group`             | `src/tools/groups/deleteGroup.ts`           | none     | port   | `src/tools/web/groups/deleteGroup.ts`           | Destructive — `guardMutation` + `RegistryEvidence`.                          |
| `list-users-in-group`      | `src/tools/groups/listUsersInGroup.ts`      | none     | port   | `src/tools/web/groups/listUsersInGroup.ts`      | Read-only, paginated.                                                        |
| `add-user-to-group`        | `src/tools/groups/addUserToGroup.ts`        | none     | port   | `src/tools/web/groups/addUserToGroup.ts`        | Admin-gated.                                                                 |
| `remove-user-from-group`   | `src/tools/groups/removeUserFromGroup.ts`   | none     | port   | `src/tools/web/groups/removeUserFromGroup.ts`   | Admin-gated.                                                                 |

SDK to port for this domain:
- `src/sdks/tableau/apis/groupsApi.ts` → `src/sdks/tableau/apis/groupsApi.ts`.
- `src/sdks/tableau/methods/groupsMethods.ts` → `src/sdks/tableau/methods/groupsMethods.ts`.
- Wire `groupsMethods` accessor into `src/sdks/tableau/restApi.ts`.

### 2.4 Permissions (9 fork tools)

Upstream v4 has NO permissions tools, SDK, capability validator, or `permissions.ts` type. Full port required.

| Fork tool                        | Fork source                                                | Upstream | Action | Target path                                             | Notes                                                                             |
| -------------------------------- | ---------------------------------------------------------- | -------- | ------ | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `list-project-permissions`       | `src/tools/permissions/listProjectPermissions.ts`          | none     | port   | `src/tools/web/permissions/listProjectPermissions.ts`   | Read-only.                                                                        |
| `list-workbook-permissions`      | `src/tools/permissions/listWorkbookPermissions.ts`         | none     | port   | `src/tools/web/permissions/listWorkbookPermissions.ts`  | Read-only.                                                                        |
| `list-datasource-permissions`    | `src/tools/permissions/listDatasourcePermissions.ts`       | none     | port   | `src/tools/web/permissions/listDatasourcePermissions.ts`| Read-only.                                                                        |
| `list-view-permissions`          | `src/tools/permissions/listViewPermissions.ts`             | none     | port   | `src/tools/web/permissions/listViewPermissions.ts`      | Read-only.                                                                        |
| `list-default-permissions`       | `src/tools/permissions/listDefaultPermissions.ts`          | none     | port   | `src/tools/web/permissions/listDefaultPermissions.ts`   | Read-only.                                                                        |
| `add-permissions`                | `src/tools/permissions/addPermissions.ts`                  | none     | port   | `src/tools/web/permissions/addPermissions.ts`           | Uses `capabilityValidator`. Wrap in `guardMutation({mode: 'preview-confirm'})` — the fork does no confirmation, but this touches security posture; treat as destructive. |
| `update-default-permissions`     | `src/tools/permissions/updateDefaultPermissions.ts`        | none     | port   | `src/tools/web/permissions/updateDefaultPermissions.ts` | Same guard treatment as add-permissions.                                          |
| `delete-permission`              | `src/tools/permissions/deletePermission.ts`                | none     | port   | `src/tools/web/permissions/deletePermission.ts`         | Destructive — `guardMutation` + `RegistryEvidence`.                               |
| `delete-default-permission`      | `src/tools/permissions/deleteDefaultPermission.ts`         | none     | port   | `src/tools/web/permissions/deleteDefaultPermission.ts`  | Destructive — same treatment.                                                     |

SDK + utils to port:
- `src/sdks/tableau/apis/permissionsApi.ts`.
- `src/sdks/tableau/methods/permissionsMethods.ts`.
- `src/sdks/tableau/types/permissions.ts` (contains `Permissions`, `Capability`, `defaultPermissionResourceTypeSchema`).
- `src/utils/permissions/capabilityValidator.ts` (unchanged copy — no v4 equivalent).
- Wire `permissionsMethods` accessor into `src/sdks/tableau/restApi.ts`.

Note the fork's 2026-01-13 fix (`44036360 fix: Remove double-nested granteeCapabilities`) and 2026-01-14 fix (`8ce552a1 fix: Handle both array and object formats for granteeCapabilities`) — these belong in `permissionsApi.ts`/`permissionsMethods.ts` and must survive the port.

### 2.5 Extract Refresh (6 fork tools)

Upstream v4 has 3 tools already: `list-extract-refresh-tasks`,
`update-cloud-extract-refresh-task`, `confirm-update-cloud-extract-refresh-task`.
Also `delete-content` handles extract-refresh-task deletion polymorphically —
that covers the fork's `delete-extract-refresh-task`.

| Fork tool                       | Fork source                                            | Upstream                                                                    | Action    | Target path                                                 | Notes                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- | --------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list-extract-refresh-tasks`    | `src/tools/extractRefresh/listExtractRefreshTasks.ts`  | `src/tools/web/extractRefreshTasks/listExtractRefreshTasks.ts`              | reuse     | (existing)                                                  | Upstream has admin-gate + client-side filter engine — a strict superset. No port.                                                                                        |
| `update-extract-refresh-task`   | `src/tools/extractRefresh/updateExtractRefreshTask.ts` | `src/tools/web/extractRefreshTasks/updateCloudExtractRefreshTask.ts` (partial) | reuse/extend | (existing, plus extension)                                | Upstream restricts to Cloud + only mutates schedule; fork also mutates type/target. Recommend reuse of upstream and drop the fork's extra surface. Verify with product owner before removing capability. |
| `delete-extract-refresh-task`   | `src/tools/extractRefresh/deleteExtractRefreshTask.ts` | `src/tools/web/_lib/deleteContent.ts` + `confirmDeleteContent.ts` (polymorphic `resourceType: 'extract-refresh-task'`) | reuse | (existing)                                                  | Use `delete-content` with `resourceType: 'extract-refresh-task'`. The fork's dedicated tool is redundant.                                                                 |
| `get-extract-refresh-task`      | `src/tools/extractRefresh/getExtractRefreshTask.ts`    | none                                                                        | port      | `src/tools/web/extractRefreshTasks/getExtractRefreshTask.ts` | SDK: `tasksMethods.getExtractRefreshTask` (fork implements it). Admin-gated + `adminToolsEnabled`.                                                                       |
| `create-extract-refresh-task`   | `src/tools/extractRefresh/createExtractRefreshTask.ts` | none                                                                        | port      | `src/tools/web/extractRefreshTasks/createExtractRefreshTask.ts` | SDK: `tasksMethods.createExtractRefreshTask`. Uses `frequencyDetailsSchema` — port that too (see `src/sdks/tableau/types/extractRefreshTask.ts`).                        |
| `run-extract-refresh-task`      | `src/tools/extractRefresh/runExtractRefreshTask.ts`    | none                                                                        | port      | `src/tools/web/extractRefreshTasks/runExtractRefreshTask.ts` | SDK: `tasksMethods.runExtractRefreshTask`. Returns a `Job`. Admin-gated.                                                                                                  |

### 2.6 Workbooks (3 fork-custom tools + 1 rewritten tool)

Note: the fork rewrote `download-workbook` semantics (local file path vs
upstream's S3 URL/temp path). This section covers ONLY the fork's additions.

| Fork tool             | Fork source                              | Upstream                                             | Action    | Target path                                | Notes                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------- | ---------------------------------------------------- | --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `download-workbook`   | `src/tools/workbooks/downloadWorkbook.ts` | `src/tools/web/workbooks/downloadWorkbook.ts`       | reuse (with decision) | (existing)                                | Upstream's `download-workbook` already returns either an S3 presigned URL (when `MCP_S3_BUCKET` is set) or a local temp path (fallback). The fork's semantics — persist to `os.tmpdir()/tableau-mcp/downloads` and return a path a downstream tool can unpack — are already covered by v4's temp-path fallback. DECISION for product owner: keep upstream as-is, or add an env flag forcing temp-path mode. Do not re-port the fork version wholesale. |
| `unpack-twbx`         | `src/tools/workbooks/unpackTwbx.ts`      | none                                                 | port      | `src/tools/web/workbooks/unpackTwbx.ts`    | Pure Node — takes a local path, extracts a twbx with `adm-zip`, reports categorized file listing. Depends on `src/utils/fileSystem.ts` (fork-only helper) — copy that too. `adm-zip` package must be added to `package.json`.                                    |
| `read-extracted-file` | `src/tools/workbooks/readExtractedFile.ts` | none                                                 | port      | `src/tools/web/workbooks/readExtractedFile.ts` | Pure Node file read with path-traversal guard (`TEMP_BASE`). Depends on `src/utils/fileSystem.ts`.                                                                                                                                                        |

The fork also ships modified `list-workbooks` and `get-workbook`, but the diffs
against upstream are cosmetic — upstream versions are strict supersets.

### 2.7 Content Exploration

The fork's `src/tools/contentExploration/searchContent.ts` is a strict subset of
upstream's `src/tools/web/contentExploration/searchContent.ts` (upstream adds
lineage enrichment). No port; reuse upstream.

### 2.8 Summary counts

| Domain              | Fork tools | Reuse upstream | Full port | Notes                                                                                    |
| ------------------- | ---------- | -------------- | --------- | ---------------------------------------------------------------------------------------- |
| Projects            | 4          | 1              | 3         | list-projects reuses upstream.                                                            |
| Users               | 6          | 2              | 4         | list-users + update-user reuse upstream.                                                  |
| Groups              | 7          | 0              | 7         | Full port including SDK.                                                                  |
| Permissions         | 9          | 0              | 9         | Full port including SDK + capability validator.                                           |
| Extract Refresh     | 6          | 3              | 3         | list/update/delete reuse upstream; get/create/run are custom ports.                        |
| Workbooks (custom)  | 3          | 1              | 2         | download-workbook already covered by upstream. unpack-twbx + read-extracted-file port.    |
| Content Exploration | 0 custom   | —              | —         | Upstream search-content is a superset.                                                    |
| **Total**           | **35**     | **7**          | **28**    |                                                                                          |

---

## 3. Shared utilities the ports need

| Utility                                                        | Upstream has it? | Notes                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/genericFilterDescription.ts`                        | yes, at `src/tools/web/genericFilterDescription.ts` | Use upstream.                                                                                                                                                                                                                                                                                                                                            |
| `src/utils/parseAndValidateFilterString.ts`                    | yes              | Unchanged in v4. Reuse.                                                                                                                                                                                                                                                                                                                                  |
| `src/utils/paginate.ts` (`paginate` fn)                        | superseded by `getPage` | Fork uses `paginate` which loops all pages; v4 replaces it with `getPage` (single page). Rewrite call sites — don't just import the old function.                                                                                                                                                                                                       |
| `src/utils/permissions/capabilityValidator.ts`                 | no               | Copy verbatim from fork.                                                                                                                                                                                                                                                                                                                                 |
| `src/utils/fileSystem.ts`                                      | no               | Copy from fork for the workbook unpack/read tools. `TEMP_BASE = os.tmpdir()/tableau-mcp`.                                                                                                                                                                                                                                                                |
| `src/tools/resourceAccessChecker.ts`                           | yes, at `src/tools/web/resourceAccessChecker.ts` | Call sig differs: fork's `isXAllowed({ …, restApiArgs: { config, requestId, server, signal } })` → v4's `isXAllowed({ …, extra })`. Update tool code accordingly.                                                                                                                                                                                        |
| `isProjectAllowed` (used by fork's update-project/delete-project) | no             | The fork's checker has an `isProjectAllowed`; v4's does not. Either (a) add `isProjectAllowed` to `src/tools/web/resourceAccessChecker.ts` following the pattern of `_isWorkbookAllowed`, or (b) inline the bounded-context check into the project mutation tools. Recommend (a) so the pattern stays consistent — check `boundedContext.projectIds`.  |
| `src/tools/web/adminGate.ts` (`assertAdmin`)                   | v4-only          | ALL admin-only ports MUST use this. Cached per (siteId,userId) via `ExpiringMap` (TTL = `ADMIN_GATE_CACHE_TTL_MINUTES`, default 5).                                                                                                                                                                                                                       |
| `src/tools/web/_lib/mutationGuard.ts` (`guardMutation`)        | v4-only          | Wraps admin-gate + evidence + audit for any destructive tool. See `evidence.ts` for `RegistryEvidence` (nonce), `TagEvidence`, `AppApprovalEvidence`, and `AllEvidence` composer.                                                                                                                                                                         |
| `src/errors/mcpToolError.ts`                                   | v4-only          | Provides `AdminOnlyError`, `PreviewNotRunError`, `UnknownError`, `PageExceedsLimitError`, `WorkbookNotAllowedError`, `DatasourceNotAllowedError`, `ViewNotAllowedError`. Ports should raise these instead of custom `{type, message}` unions.                                                                                                              |

---

## 4. Known gotchas

1. **`useRestApi` signature changed.** Fork: `useRestApi({ config, requestId, server, jwtScopes, signal, authInfo: getTableauAuthInfo(authInfo), callback })`. v4: `useRestApi({ ...extra, jwtScopes: tool.requiredApiScopes, callback })`. `extra` is the tool callback's second arg and carries everything needed.

2. **Annotations are required-strict.** v4 uses `Required<ToolAnnotations>` — all four flags (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) MUST be present. Fork tools often omit `destructiveHint`/`idempotentHint`.

3. **`ConstrainedResult<T>` import path.** Fork: `import { ConstrainedResult, Tool } from '../tool.js'` (base type). v4: `import { ConstrainedResult, WebTool } from '../tool.js'` — but the file is `src/tools/web/tool.ts`, and the type is redefined there. Do not import from `src/tools/tool.ts` — that is the abstract base.

4. **Zodios POST/PUT bodies.** The fork PR history documents two Zodios pitfalls (`5ef8290f` and `23b99c3e`): body params must be declared via `parameters: [{ name: 'body', type: 'Body', schema: ... }]` and DELETE endpoints don't use a body. Port carefully; look at the fork's `permissionsApi.ts`/`groupsApi.ts` for correct patterns.

5. **`permissionsApi.granteeCapabilities` shape.** Fork commits `44036360` and `8ce552a1` document that the API returns either an array OR an object for `granteeCapabilities`, and the fork had to be tolerant to both. Preserve these fixes when porting `permissions.ts` and `permissionsApi.ts`.

6. **Bounded-context filtering moved.** Fork calls `getConfig().boundedContext` inline. v4 gets it from `(await extra.getConfigWithOverrides()).boundedContext` — this allows per-site overrides via MCP site settings.

7. **`getPage` vs `paginate`.** v4's `getPage` returns `{ data, totalAvailable }` for a single page and honors `pageNumber`/`limit`/`maxResultLimit`. Fork's `paginate` loops until exhausted. Every ported "list" tool must switch to single-page semantics and expose `pageNumber` in `paramsSchema`.

8. **Admin gate feature flag.** `config.adminToolsEnabled` (env `ADMIN_TOOLS_ENABLED=true`) is required to REGISTER admin-only tools. If a ported admin tool is not showing up in `webToolFactories`' output, check this flag first. Also add a `enabledTools.delete(...)` line in `src/server/oauth/scopes.ts` `getEnabledToolNames` for each new admin tool.

9. **Fork's `update-user` allowed `fullName`/`email`.** Upstream limits to `siteRole` only (safer + license-reclaim focused). Do not re-add unless the product owner explicitly asks.

10. **Fork's `download-workbook` returned `{ filePath, fileName, format, nextStep, … }` as JSON text.** Upstream returns either `resource_link` (S3 URL) or `{ path, filename, mimeType }` (temp path fallback). Any client that consumed the fork's `nextStep` field will break — that field is gone.

11. **`os.tmpdir()` path convention.** Fork: `os.tmpdir()/tableau-mcp/{downloads,extracted}`. v4's workbook temp fallback: `os.tmpdir()/tableau-mcp-workbooks`. If you keep unpack-twbx pointing at `tableau-mcp/downloads`, either make v4's download tool also write there, or make unpack-twbx accept absolute paths (it already does — `filePath` is caller-controlled). Verify the flow end-to-end before committing.

12. **Tool name literal type.** After adding a new tool name to `webToolNames`, run `pnpm tsc --noEmit` — `WebToolName` will fail if a name is used in `toolScopeMap` but not in the array (or vice versa).

---

## 5. Env vars and container contract for v4.5.2

### 5.1 Env vars the container must set

Compared to v1.13.10, v4.5.2 adds/changes:

| Env var                                    | Purpose                                                                                            | Required?                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `SERVER`                                   | Tableau Server URL (unchanged).                                                                    | yes                                                                              |
| `SITE_NAME`                                | Site name (unchanged).                                                                             | yes (usually)                                                                    |
| `TRANSPORT`                                | `stdio` or `http`.                                                                                 | yes                                                                              |
| `HTTP_PORT_ENV_VAR_NAME`                   | Name of the env var that contains the HTTP port (indirection for platforms like Heroku).           | default `PORT`                                                                    |
| `AUTH`                                     | One of `pat`, `uat`, `direct-trust`, `oauth`. Fork used `PAT`/direct-trust; v4 formalizes it.       | yes                                                                              |
| `PAT_NAME` / `PAT_VALUE`                   | PAT credentials.                                                                                   | when `AUTH=pat`                                                                  |
| `JWT_SUB_CLAIM`                            | JWT sub for direct-trust.                                                                          | when `AUTH=direct-trust`                                                          |
| `CONNECTED_APP_CLIENT_ID` / `_SECRET_ID` / `_SECRET_VALUE` | Connected App credentials.                                                       | when `AUTH=direct-trust`                                                          |
| `UAT_TENANT_ID` / `UAT_ISSUER` / `UAT_USERNAME_CLAIM_NAME` / `UAT_USERNAME_CLAIM` / `UAT_PRIVATE_KEY` / `UAT_PRIVATE_KEY_PATH` / `UAT_KEY_ID` | Unified Access Token config. | when `AUTH=uat`                                                                   |
| `OAUTH_ISSUER`                             | OAuth issuer URL. Required when `TRANSPORT=http` unless `DANGEROUSLY_DISABLE_OAUTH=true`.          | when `TRANSPORT=http` + OAuth enabled                                             |
| `OAUTH_EMBEDDED_AUTHZ_SERVER`              | `true` to run the embedded authz server (v4 default).                                              | optional                                                                          |
| `OAUTH_RESOURCE_URI`                       | Public URI. Defaults to `http://127.0.0.1:${httpPort}`.                                            | optional                                                                          |
| `OAUTH_JWE_PRIVATE_KEY` / `_PATH` / `_PASSPHRASE` | JWE keypair for OAuth tokens.                                                                | when OAuth enabled                                                                |
| `OAUTH_CLIENT_ID_SECRET_PAIRS`             | JSON `{ "client_id": "secret", … }`.                                                               | when OAuth enabled                                                                |
| `OAUTH_CIMD_DNS_SERVERS`                   | DNS servers for CIMD (Client ID Metadata Documents) resolution.                                    | optional                                                                          |
| `DANGEROUSLY_DISABLE_OAUTH`                | `true` disables OAuth on HTTP transport. Development only.                                         | optional                                                                          |
| `SSL_KEY` / `SSL_CERT`                     | HTTPS server certificate paths.                                                                    | optional                                                                          |
| `CORS_ORIGIN_CONFIG`                       | Comma-separated origin list or `*`.                                                                | optional                                                                          |
| `ADMIN_TOOLS_ENABLED`                      | `true` to register admin tools (`update-user`, `list-users`, `list-jobs`, `list-extract-refresh-tasks`, `update-cloud-extract-refresh-task`, `delete-content`, `query-admin-insights`, and any newly ported admin tool). | yes, for the fork's toolset to work                                              |
| `FLOW_TOOLS_ENABLED`                       | `true` to register flow tools.                                                                     | optional                                                                          |
| `INSIGHTS_TOOLS_ENABLED`                   | `true` to register Pulse insight tools.                                                            | optional                                                                          |
| `ENABLE_MCP_SITE_SETTINGS`                 | `true` to enable per-site config overrides via MCP site settings.                                  | optional                                                                          |
| `ALLOW_SITES_TO_CONFIGURE_REQUEST_OVERRIDES` | `true` to honor `x-tableau-mcp-config` request header.                                            | optional                                                                          |
| `ENABLE_PASSTHROUGH_AUTH`                  | `true` to accept `workgroup_session_id` cookie for embedded Tableau flows.                          | optional                                                                          |
| `TELEMETRY_PROVIDER` / `TELEMETRY_PROVIDER_CONFIG` | Telemetry provider name + JSON config.                                                      | optional                                                                          |
| `FEATURE_GATE_PROVIDER` / `FEATURE_GATE_PROVIDER_CONFIG` | Feature-gate provider (used for `mcp-apps`, `authoring-tools`).                       | optional                                                                          |
| `PRODUCT_TELEMETRY_ENDPOINT` / `PRODUCT_TELEMETRY_ENABLED` | Product telemetry sink.                                                              | optional                                                                          |
| `MCP_S3_BUCKET` / `AWS_DEFAULT_REGION` / `MCP_IMAGE_PREFIX` / `FILE_TTL` | S3 export bucket for images and workbook downloads.                    | optional                                                                          |
| `LOG_LEVEL`                                | logger severity.                                                                                   | optional (default `debug`)                                                        |
| `TABLEAU_SERVER_VERSION_CHECK_INTERVAL_IN_HOURS` / `PASSTHROUGH_AUTH_USER_SESSION_CHECK_INTERVAL_IN_MINUTES` / `MCP_SITE_SETTINGS_CHECK_INTERVAL_IN_MINUTES` | Poll intervals. | optional                                                                          |
| `OAUTH_AUTHORIZATION_CODE_TIMEOUT_MS` / `_ACCESS_TOKEN_TIMEOUT_MS` / `_REFRESH_TOKEN_TIMEOUT_MS` | OAuth timeouts.                                                            | optional                                                                          |
| `ADMIN_GATE_CACHE_TTL_MINUTES`             | TTL for the site-role admin cache (default 5).                                                     | optional                                                                          |
| `ADVERTISE_API_SCOPES`                     | `true` to advertise Tableau API scopes on OAuth discovery.                                         | optional                                                                          |
| `BREAK_GLASS_DISABLE_GLOBALLY`             | `true` disables the whole server.                                                                  | optional                                                                          |

### 5.2 HTTP paths

| Path                       | Method              | Purpose                                                                          |
| -------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `/tableau-mcp`             | POST / GET / DELETE | MCP StreamableHTTP transport endpoint. Mounted from `serverName='tableau-mcp'`.  |
| `/.well-known/…`           | GET                 | OAuth discovery endpoints (when OAuth enabled + embedded authz server).           |
| OAuth authorize/token/etc. | as per OAuth spec   | Registered by `oauthProvider.setupRoutes(app)`.                                   |

Note: both fork and upstream v4.5.2 mount the MCP endpoint at `/tableau-mcp`,
not `/mcp`. The Terraform load balancer must forward `/tableau-mcp` (and any
`/.well-known/*` if OAuth is enabled) to the container.

### 5.3 Deltas the Terraform side must handle

1. **Add `ADMIN_TOOLS_ENABLED=true`** to the container env. Without this the
   admin-only tools (list-users, update-user, list-extract-refresh-tasks, etc.)
   silently disappear from the tool list. This is the single most-likely-broken
   env var after the cutover.
2. **`AUTH` is now required and validated.** The fork accepted a looser config;
   v4 will invariant-fail at startup if `AUTH` is not one of `pat|uat|direct-trust|oauth`.
3. **`OAUTH_ISSUER` is required for HTTP transport** unless `DANGEROUSLY_DISABLE_OAUTH=true`.
   For the current TIL container running on stdio behind Claude Code this is a
   non-issue; for HTTP-mode deployments this MUST be set.
4. **Optional: enable feature flags.** `mcp-apps` and `authoring-tools` are
   feature-gated (via `FEATURE_GATE_PROVIDER`). If the deployment does not run
   the feature-gate provider, both gate to `false` and disable `download-workbook`,
   `request-workbook-upload`, `validate-upload-and-publish-workbook`,
   `confirm-delete-content`, and `render-interactive-viz`.
5. **S3 bucket is now optional.** Fork wrote workbook downloads to `os.tmpdir()`;
   v4 defaults to `os.tmpdir()/tableau-mcp-workbooks` when `MCP_S3_BUCKET` is
   unset. If the caller has been consuming a `filePath` from the fork's response,
   check the shape change in §4 gotcha 10.

---

## 6. Suggested split for 3 parallel porting agents

The proposed split (Projects+ExtractRefresh / Users+Groups / Permissions+Workbooks+ContentExploration)
is reasonable but Content Exploration is already covered upstream — nothing to port. Rebalancing:

**Agent 1 — Projects + Extract Refresh** (~7 tools + SDK extensions)
- Files owned: `src/tools/web/projects/{create,update,delete}Project.ts`,
  `src/tools/web/extractRefreshTasks/{get,create,run}ExtractRefreshTask.ts`,
  `src/sdks/tableau/apis/projectsApi.ts` (extend),
  `src/sdks/tableau/methods/projectsMethods.ts` (extend),
  `src/sdks/tableau/apis/tasksApi.ts` (extend),
  `src/sdks/tableau/methods/tasksMethods.ts` (extend).
- Adds `isProjectAllowed` to `src/tools/web/resourceAccessChecker.ts` (§3).

**Agent 2 — Users + Groups** (~11 tools + full groups SDK)
- Files owned: `src/tools/web/users/{get,create,delete,listGroupsFor}User.ts`,
  `src/tools/web/groups/*.ts`,
  `src/sdks/tableau/apis/usersApi.ts` (extend),
  `src/sdks/tableau/methods/usersMethods.ts` (extend),
  `src/sdks/tableau/apis/groupsApi.ts` (new),
  `src/sdks/tableau/methods/groupsMethods.ts` (new).
- Wires groupsMethods into `src/sdks/tableau/restApi.ts`.

**Agent 3 — Permissions + Workbooks (custom)** (~11 tools + full permissions SDK + fileSystem util)
- Files owned: `src/tools/web/permissions/*.ts`,
  `src/tools/web/workbooks/{unpackTwbx,readExtractedFile}.ts`,
  `src/sdks/tableau/apis/permissionsApi.ts` (new),
  `src/sdks/tableau/methods/permissionsMethods.ts` (new),
  `src/sdks/tableau/types/permissions.ts` (new),
  `src/utils/permissions/capabilityValidator.ts` (new),
  `src/utils/fileSystem.ts` (new).
- Wires permissionsMethods into `src/sdks/tableau/restApi.ts`.
- Adds `adm-zip` to `package.json`.

**Coordination points (all three agents touch):**
- `src/tools/web/tools.ts` — each agent adds their factory imports. Merge in order agent1→agent2→agent3 to minimize conflicts; each edit is additive.
- `src/tools/web/toolName.ts` — same additive-merge treatment.
- `src/server/oauth/scopes.ts` — each agent adds their tools' entries to `toolScopeMap` and the `!config.adminToolsEnabled` block. Additive.
- `src/sdks/tableau/restApi.ts` — Agent 2 (groups accessor) + Agent 3 (permissions accessor) both touch this file. Consider having one agent do both new accessors in a single PR to avoid conflicts.

**Sequencing note:** Agent 3's `permissionsApi.ts` port must preserve the two
granteeCapabilities fixes from fork commits `44036360` and `8ce552a1`. Read those
commits' diffs first before writing new code.
