import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { useRestApi } from '../../../restApiInstance.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  groupId: z.string().describe('The LUID of the group to remove the user from.'),
  userId: z.string().describe('The LUID of the user to remove.'),
};

export const getRemoveUserFromGroupTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const removeUserFromGroupTool = new WebTool({
    server,
    name: 'remove-user-from-group',
    disabled: !config.adminToolsEnabled,
    description: `
  Removes a user from the specified group. The user will lose any permissions granted through this group; they are NOT removed from the site.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`groupId\` (required) – The LUID of the group.
  - \`userId\` (required) – The LUID of the user to remove.

  Tableau REST API scopes: \`tableau:groups:update\`, \`tableau:users:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Remove User from Group',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ groupId, userId }, extra): Promise<CallToolResult> => {
      return await removeUserFromGroupTool.logAndExecute<string>({
        extra,
        args: { groupId, userId },
        callback: async () => {
          await useRestApi({
            ...extra,
            jwtScopes: removeUserFromGroupTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                throw new Error(adminResult.error);
              }
              await restApi.groupsMethods.removeUserFromGroup({
                siteId: restApi.siteId,
                groupId,
                userId,
              });
            },
          });

          return new Ok(
            `User '${userId}' has been successfully removed from group '${groupId}'.`,
          );
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return removeUserFromGroupTool;
};
