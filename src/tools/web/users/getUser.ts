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
  userId: z.string().describe('The LUID of the user to retrieve. Obtain from list-users.'),
};

export const getGetUserTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const getUserTool = new WebTool({
    server,
    name: 'get-user',
    disabled: !config.adminToolsEnabled,
    description: `
  Retrieves information about the specified user, including their name, email, site role, and authentication settings. Use this tool when a user requests details about a specific Tableau user.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`userId\` (required) – The LUID of the user to retrieve. Obtain from \`list-users\`.

  Tableau REST API scope: \`tableau:users:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Get User',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ userId }, extra): Promise<CallToolResult> => {
      return await getUserTool.logAndExecute<User>({
        extra,
        args: { userId },
        callback: async () => {
          const user = await useRestApi({
            ...extra,
            jwtScopes: getUserTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                throw new Error(adminResult.error);
              }
              return await restApi.usersMethods.queryUserOnSite({
                siteId: restApi.siteId,
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

  return getUserTool;
};
