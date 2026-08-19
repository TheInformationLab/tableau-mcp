import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Group } from '../../../sdks/tableau/types/group.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  name: z.string().min(1).describe('The name for the new group.'),
  minimumSiteRole: z
    .string()
    .optional()
    .describe(
      'Optional minimum site role for users added via group role grant (Creator, Explorer, ' +
        'ExplorerCanPublish, Viewer, Unlicensed, etc.).',
    ),
};

export const getCreateGroupTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const createGroupTool = new WebTool({
    server,
    name: 'create-group',
    disabled: !config.adminToolsEnabled,
    description: `
  Creates a new group on the specified Tableau site.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`name\` (required) – The name for the new group.
  - \`minimumSiteRole\` (optional) – Minimum site role granted to members through this group.

  Tableau REST API scopes: \`tableau:groups:create\`, \`tableau:users:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Create Group',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async ({ name, minimumSiteRole }, extra): Promise<CallToolResult> => {
      return await createGroupTool.logAndExecute<Group>({
        extra,
        args: { name, minimumSiteRole },
        callback: async () => {
          const group = await useRestApi({
            ...extra,
            jwtScopes: createGroupTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                throw new Error(adminResult.error);
              }
              return await restApi.groupsMethods.createGroup({
                siteId: restApi.siteId,
                group: { name, minimumSiteRole },
              });
            },
          });

          return new Ok(group);
        },
        constrainSuccessResult: (group) => ({ type: 'success', result: group }),
      });
    },
  });

  return createGroupTool;
};
