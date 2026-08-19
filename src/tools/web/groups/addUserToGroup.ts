import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { useRestApi } from '../../../restApiInstance.js';
import { User } from '../../../sdks/tableau/types/user.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  groupId: z.string().describe('The LUID of the group to add the user to.'),
  userId: z.string().describe('The LUID of the user to add.'),
};

export const getAddUserToGroupTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const addUserToGroupTool = new WebTool({
    server,
    name: 'add-user-to-group',
    disabled: !config.adminToolsEnabled,
    description: `
  Adds a user to the specified group.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`groupId\` (required) – The LUID of the group.
  - \`userId\` (required) – The LUID of the user to add.

  Tableau REST API scopes: \`tableau:groups:update\`, \`tableau:users:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Add User to Group',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ groupId, userId }, extra): Promise<CallToolResult> => {
      return await addUserToGroupTool.logAndExecute<User>({
        extra,
        args: { groupId, userId },
        callback: async () => {
          const user = await useRestApi({
            ...extra,
            jwtScopes: addUserToGroupTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                throw new Error(adminResult.error);
              }
              return await restApi.groupsMethods.addUserToGroup({
                siteId: restApi.siteId,
                groupId,
                userId,
              });
            },
          });

          return new Ok(user);
        },
        constrainSuccessResult: (user) => ({ type: 'success', result: user }),
      });
    },
  });

  return addUserToGroupTool;
};
