import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { UnknownError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { WebMcpServer } from '../../../server.web.js';
import { RegistryEvidence } from '../_lib/evidence.js';
import { guardMutation, MutationTarget } from '../_lib/mutationGuard.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  userId: z
    .string()
    .uuid('userId must be a valid UUID')
    .describe('The LUID of the user to delete. Obtain from list-users.'),
  mapAssetsTo: z
    .string()
    .uuid('mapAssetsTo must be a valid UUID')
    .optional()
    .describe(
      'Optional LUID of the user to reassign content ownership to. When omitted, the deleted ' +
        "user's content will be orphaned.",
    ),
  confirm: z
    .boolean()
    .optional()
    .describe(
      'When omitted or false, runs a non-destructive preview: looks up the user and reports the ' +
        'proposed deletion without applying it, returning a single-use confirmation token. When ' +
        'true, applies the deletion — but only if the confirmationToken from a prior preview of ' +
        'this same userId (and optional mapAssetsTo) is supplied.',
    ),
  confirmationToken: z
    .string()
    .optional()
    .describe(
      'The single-use confirmation token returned by a prior preview call for this userId. ' +
        'Required when confirm is true; ignored otherwise.',
    ),
};

export const getDeleteUserTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const deleteUserTool = new WebTool({
    server,
    name: 'delete-user',
    disabled: !config.adminToolsEnabled,
    description: `
  **WARNING: This is a destructive operation that cannot be undone.**

  Removes a user from the specified Tableau site. When a user is deleted their content can optionally be reassigned to another user (\`mapAssetsTo\`).

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  This tool is **two-phase** to protect against accidental deletions:

  1. **Preview (default — \`confirm\` omitted or false):** looks up the user, reports the target, and returns a single-use confirmation token. Nothing is changed.
  2. **Delete (\`confirm: true\`):** applies the deletion. Requires the \`confirmationToken\` from a prior preview of this same \`userId\` (and optional \`mapAssetsTo\`).

  **Required human confirmation:** After preview, present the change to the user and get explicit approval before calling again with \`confirm: true\`. Do not auto-confirm.

  **Parameters:**
  - \`userId\` (required) – The LUID of the user to delete.
  - \`mapAssetsTo\` (optional) – LUID of the user to reassign the deleted user's content to.
  - \`confirm\` (optional) – Set \`true\` to apply the deletion (requires confirmationToken).
  - \`confirmationToken\` (optional) – The single-use token from the preview. Required when \`confirm\` is true.

  Tableau REST API scopes: \`tableau:users:delete\`, \`tableau:users:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Delete User',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (args, extra): Promise<CallToolResult> => {
      return await deleteUserTool.logAndExecute<string>({
        extra,
        args,
        callback: async () => {
          return await useRestApi({
            ...extra,
            jwtScopes: deleteUserTool.requiredApiScopes,
            callback: async (restApi) => {
              const evidence = new RegistryEvidence();
              const binding = `${args.userId}:${args.mapAssetsTo ?? ''}`;

              let cachedUser: Awaited<
                ReturnType<typeof restApi.usersMethods.queryUserOnSite>
              > | null = null;

              const resolveTarget = async (): Promise<MutationTarget> => {
                cachedUser = await restApi.usersMethods.queryUserOnSite({
                  siteId: restApi.siteId,
                  userId: args.userId,
                });
                return {
                  id: args.userId,
                  name: cachedUser.name,
                  kind: 'user',
                };
              };

              const guardResult = await guardMutation({
                restApi,
                extra,
                tool: 'delete-user',
                action: 'delete',
                mode: 'preview-confirm',
                phase: args.confirm ? 'confirm' : 'preview',
                evidence,
                resolveTarget,
                confirmationToken: args.confirmationToken,
                binding,
                fallbackTargetKind: 'user',
              });
              if (guardResult.isErr()) {
                return guardResult.error.toErr();
              }
              const { target, recordOutcome } = guardResult.value;

              if (!args.confirm) {
                const user =
                  cachedUser ??
                  (await restApi.usersMethods.queryUserOnSite({
                    siteId: restApi.siteId,
                    userId: args.userId,
                  }));
                const email = user.email ?? 'no email';
                const role = user.siteRole ?? 'unknown role';
                const nonce = evidence.getEstablishedNonce()!;
                const reassign = args.mapAssetsTo
                  ? ` Their content will be reassigned to user LUID ${args.mapAssetsTo}.`
                  : ' Their content will be orphaned unless you supply mapAssetsTo.';
                return new Ok(
                  `Preview — user '${target.name ?? args.userId}' (${email}, ${role}) would be ` +
                    `removed from the site.${reassign} ` +
                    'No change has been made. ' +
                    'NEXT STEP — REQUIRED: present this change to the user and ask them to ' +
                    "explicitly confirm it. Do NOT apply without the user's approval. " +
                    `Once approved, call again with confirm: true and confirmationToken: "${nonce}" ` +
                    '(the server will verify and consume this single-use token before deleting).',
                );
              }

              try {
                await restApi.usersMethods.deleteUser({
                  siteId: restApi.siteId,
                  userId: args.userId,
                  mapAssetsTo: args.mapAssetsTo,
                });
                recordOutcome({ ok: true });
                return new Ok(
                  `User '${target.name ?? args.userId}' has been successfully deleted from the site.`,
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                recordOutcome({ ok: false, failureDetail: message });
                return new UnknownError(
                  `Failed to delete user '${args.userId}': ${message}`,
                ).toErr();
              }
            },
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return deleteUserTool;
};
