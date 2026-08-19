import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { ArgsValidationError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Group } from '../../../sdks/tableau/types/group.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  groupId: z.string().describe('The LUID of the group to update.'),
  name: z.string().min(1).optional().describe('Optional new name for the group.'),
  minimumSiteRole: z.string().optional().describe('Optional new minimum site role.'),
};

export const getUpdateGroupTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const updateGroupTool = new WebTool({
    server,
    name: 'update-group',
    disabled: !config.adminToolsEnabled,
    description: `
  Updates an existing group on the specified Tableau site.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`groupId\` (required) – The LUID of the group to update.
  - \`name\` (optional) – New name for the group.
  - \`minimumSiteRole\` (optional) – New minimum site role.

  At least one of \`name\` or \`minimumSiteRole\` must be provided.

  Tableau REST API scopes: \`tableau:groups:update\`, \`tableau:users:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Update Group',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ groupId, name, minimumSiteRole }, extra): Promise<CallToolResult> => {
      return await updateGroupTool.logAndExecute<Partial<Group>>({
        extra,
        args: { groupId, name, minimumSiteRole },
        callback: async () => {
          if (name === undefined && minimumSiteRole === undefined) {
            return new ArgsValidationError(
              'update-group requires at least one of `name` or `minimumSiteRole` to be provided.',
            ).toErr();
          }

          const group = await useRestApi({
            ...extra,
            jwtScopes: updateGroupTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                throw new Error(adminResult.error);
              }
              return await restApi.groupsMethods.updateGroup({
                siteId: restApi.siteId,
                groupId,
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

  return updateGroupTool;
};
