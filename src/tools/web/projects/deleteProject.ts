import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { ProjectNotAllowedError, UnknownError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { WebMcpServer } from '../../../server.web.js';
import { RegistryEvidence } from '../_lib/evidence.js';
import { renderTokenConfirmNextStep } from '../_lib/hitlText.js';
import { guardMutation, MutationTarget } from '../_lib/mutationGuard.js';
import { resourceAccessChecker } from '../resourceAccessChecker.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  projectId: z.string().describe('The LUID of the project to delete. Obtain from list-projects.'),
  confirm: z
    .boolean()
    .optional()
    .describe(
      'When omitted or false, runs a non-destructive preview and returns a single-use ' +
        'confirmation token. When true, applies the deletion — but only if the confirmationToken ' +
        'from a prior preview of this same projectId is supplied.',
    ),
  confirmationToken: z
    .string()
    .optional()
    .describe(
      'The single-use confirmation token returned by a prior preview call for this projectId. ' +
        'Required when confirm is true; ignored otherwise.',
    ),
};

export const getDeleteProjectTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const deleteProjectTool = new WebTool({
    server,
    name: 'delete-project',
    disabled: !config.adminToolsEnabled,
    description: `
  **WARNING: This is a destructive operation that cannot be undone.**

  Deletes the specified project from the Tableau site. Content in the project (workbooks, datasources, views) is typically moved to the parent project or the default project — the exact behavior depends on the site configuration.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  This tool is **two-phase** to protect against accidental deletion:

  1. **Preview (default — \`confirm\` omitted or false):** looks up the project and reports what would be deleted, then returns a single-use confirmation token. Nothing is changed.
  2. **Delete (\`confirm: true\`):** applies the deletion. Requires the \`confirmationToken\` from a prior preview of this same \`projectId\` (the server verifies and consumes it).

  **Required human confirmation:** After preview, present the change to the user and get explicit approval before calling again with \`confirm: true\`. Do not auto-confirm.

  **Parameters:**
  - \`projectId\` (required) – The LUID of the project to delete.
  - \`confirm\` (optional) – Set \`true\` to apply deletion (requires confirmationToken).
  - \`confirmationToken\` (optional) – The single-use token from the preview. Required when \`confirm\` is true.

  Tableau REST API scope: \`tableau:projects:delete\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Delete Project',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (args, extra): Promise<CallToolResult> => {
      return await deleteProjectTool.logAndExecute<string>({
        extra,
        args,
        callback: async () => {
          return await useRestApi({
            ...extra,
            jwtScopes: deleteProjectTool.requiredApiScopes,
            callback: async (restApi) => {
              // Bounded-context gate BEFORE guardMutation so a project outside the caller's
              // scope is rejected with a scope-specific error, not swallowed by the admin
              // check.
              const allowed = await resourceAccessChecker.isProjectAllowed({
                projectId: args.projectId,
                extra,
              });
              if (!allowed.allowed) {
                return new ProjectNotAllowedError(allowed.message).toErr();
              }

              // Resolve the audit target by looking up the project by luid via the filtered
              // list endpoint. Projects have no dedicated GET, so a filter query is the
              // cheapest way to name the target for the audit record.
              let cachedName: string | undefined;
              const resolveTarget = async (): Promise<MutationTarget> => {
                try {
                  const { projects } = await restApi.projectsMethods.queryProjects({
                    siteId: restApi.siteId,
                    filter: `luid:eq:${args.projectId}`,
                    pageSize: 1,
                    pageNumber: 1,
                  });
                  cachedName = projects[0]?.name;
                } catch {
                  // Fallthrough — resolveTarget must not throw. An id-only target is fine.
                }
                return {
                  id: args.projectId,
                  ...(cachedName ? { name: cachedName } : {}),
                  kind: 'project',
                };
              };

              const evidence = new RegistryEvidence();
              const guardResult = await guardMutation({
                restApi,
                extra,
                tool: 'delete-project',
                action: 'delete',
                mode: 'preview-confirm',
                phase: args.confirm ? 'confirm' : 'preview',
                evidence,
                resolveTarget,
                confirmationToken: args.confirmationToken,
                fallbackTargetKind: 'project',
              });
              if (guardResult.isErr()) {
                return guardResult.error.toErr();
              }
              const { target, recordOutcome } = guardResult.value;

              if (!args.confirm) {
                const nonce = evidence.getEstablishedNonce();
                return new Ok(
                  `Preview — project '${target.name ?? args.projectId}' (id: ${args.projectId}) would be deleted. ` +
                    'Content in the project (workbooks, datasources, views) is typically moved to ' +
                    'the parent project or default project. This operation cannot be undone. ' +
                    renderTokenConfirmNextStep({
                      subject: 'present this deletion',
                      approvalClause: 'confirm it. Do NOT apply',
                      nonce,
                      tail: ', which is bound to this projectId, before applying the deletion).',
                    }),
                );
              }

              try {
                await restApi.projectsMethods.deleteProject({
                  siteId: restApi.siteId,
                  projectId: args.projectId,
                });
                recordOutcome({ ok: true });
                return new Ok(
                  `Project '${target.name ?? args.projectId}' (id: ${args.projectId}) has been successfully deleted.`,
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                recordOutcome({ ok: false, failureDetail: message });
                return new UnknownError(
                  `Failed to delete project '${args.projectId}': ${message}`,
                ).toErr();
              }
            },
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return deleteProjectTool;
};
