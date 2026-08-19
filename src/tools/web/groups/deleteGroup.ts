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
  groupId: z
    .string()
    .uuid('groupId must be a valid UUID')
    .describe('The LUID of the group to delete. Obtain from list-groups.'),
  confirm: z
    .boolean()
    .optional()
    .describe(
      'When omitted or false, runs a non-destructive preview: looks up the group and reports ' +
        'the proposed deletion without applying it, returning a single-use confirmation token. ' +
        'When true, applies the deletion — but only if the confirmationToken from a prior ' +
        'preview of this same groupId is supplied.',
    ),
  confirmationToken: z
    .string()
    .optional()
    .describe(
      'The single-use confirmation token returned by a prior preview call for this groupId. ' +
        'Required when confirm is true; ignored otherwise.',
    ),
};

export const getDeleteGroupTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const deleteGroupTool = new WebTool({
    server,
    name: 'delete-group',
    disabled: !config.adminToolsEnabled,
    description: `
  **WARNING: This is a destructive operation that cannot be undone.**

  Deletes the specified group from the Tableau site. Users in the group will lose any permissions granted through this group (they are NOT deleted from the site).

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  This tool is **two-phase** to protect against accidental deletions:

  1. **Preview (default — \`confirm\` omitted or false):** looks up the group and returns a single-use confirmation token.
  2. **Delete (\`confirm: true\`):** applies the deletion. Requires the \`confirmationToken\` from a prior preview of this same \`groupId\`.

  **Required human confirmation:** After preview, present the change to the user and get explicit approval before calling again with \`confirm: true\`.

  **Parameters:**
  - \`groupId\` (required) – The LUID of the group to delete.
  - \`confirm\` (optional) – Set \`true\` to apply the deletion (requires confirmationToken).
  - \`confirmationToken\` (optional) – The single-use token from the preview.

  Tableau REST API scopes: \`tableau:groups:delete\`, \`tableau:groups:read\`, \`tableau:users:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Delete Group',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (args, extra): Promise<CallToolResult> => {
      return await deleteGroupTool.logAndExecute<string>({
        extra,
        args,
        callback: async () => {
          return await useRestApi({
            ...extra,
            jwtScopes: deleteGroupTool.requiredApiScopes,
            callback: async (restApi) => {
              const evidence = new RegistryEvidence();
              const binding = args.groupId;

              // The Tableau REST API does not expose a GET /groups/:id endpoint, so the best
              // available lookup is a single page of listGroups + client-side match on id. On sites
              // with >1000 groups this may not find a match, in which case the audit record and
              // preview text fall back to the raw id — safe because the guard's evidence gate is
              // keyed on id, not name.
              let cachedGroup: { name?: string; userCount?: number } | null = null;

              const resolveTarget = async (): Promise<MutationTarget> => {
                try {
                  const { groups } = await restApi.groupsMethods.listGroups({
                    siteId: restApi.siteId,
                    pageSize: 1000,
                  });
                  const match = groups.find((g) => g.id === args.groupId);
                  if (match) {
                    cachedGroup = { name: match.name, userCount: match.userCount };
                  }
                } catch {
                  // ignore — fall back to id-only target
                }

                return {
                  id: args.groupId,
                  name: cachedGroup?.name,
                  kind: 'group',
                };
              };

              const guardResult = await guardMutation({
                restApi,
                extra,
                tool: 'delete-group',
                action: 'delete',
                mode: 'preview-confirm',
                phase: args.confirm ? 'confirm' : 'preview',
                evidence,
                resolveTarget,
                confirmationToken: args.confirmationToken,
                binding,
                fallbackTargetKind: 'group',
              });
              if (guardResult.isErr()) {
                return guardResult.error.toErr();
              }
              const { target, recordOutcome } = guardResult.value;

              if (!args.confirm) {
                const nonce = evidence.getEstablishedNonce()!;
                const memberCount = cachedGroup?.userCount;
                const memberInfo =
                  typeof memberCount === 'number'
                    ? ` It currently has ${memberCount} member${memberCount === 1 ? '' : 's'}, who will lose any permissions granted via this group but remain on the site.`
                    : ' Members will lose any permissions granted via this group but remain on the site.';
                return new Ok(
                  `Preview — group '${target.name ?? args.groupId}' would be deleted.${memberInfo} ` +
                    'No change has been made. ' +
                    'NEXT STEP — REQUIRED: present this change to the user and ask them to explicitly ' +
                    "confirm it. Do NOT apply without the user's approval. " +
                    `Once approved, call again with confirm: true and confirmationToken: "${nonce}" ` +
                    '(the server will verify and consume this single-use token before deleting).',
                );
              }

              try {
                await restApi.groupsMethods.deleteGroup({
                  siteId: restApi.siteId,
                  groupId: args.groupId,
                });
                recordOutcome({ ok: true });
                return new Ok(
                  `Group '${target.name ?? args.groupId}' has been successfully deleted.`,
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                recordOutcome({ ok: false, failureDetail: message });
                return new UnknownError(
                  `Failed to delete group '${args.groupId}': ${message}`,
                ).toErr();
              }
            },
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return deleteGroupTool;
};
