import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { useRestApi } from '../../../restApiInstance.js';
import { Permissions } from '../../../sdks/tableau/types/permissions.js';
import { WebMcpServer } from '../../../server.web.js';
import { formatCapabilitiesForDisplay } from '../../../utils/permissions/capabilityValidator.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  viewId: z.string().describe('The LUID of the view'),
};

export const getListViewPermissionsTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const listViewPermissionsTool = new WebTool({
    server,
    name: 'list-view-permissions',
    description: `
Returns the permissions for the specified view, showing which users and groups have access and what capabilities they have.

**Parameters:**
- \`viewId\` (required): The LUID of the view

**Valid View Capabilities:**
${formatCapabilitiesForDisplay('views')}

**Example Usage:**
- List permissions for a view:
    viewId: "abc123-def456"
`,
    paramsSchema,
    annotations: {
      title: 'List View Permissions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ viewId }, extra): Promise<CallToolResult> => {
      return await listViewPermissionsTool.logAndExecute<Permissions>({
        extra,
        args: { viewId },
        callback: async () => {
          const permissions = await useRestApi({
            ...extra,
            jwtScopes: listViewPermissionsTool.requiredApiScopes,
            callback: async (restApi) => {
              return await restApi.permissionsMethods.getViewPermissions({
                siteId: restApi.siteId,
                viewId,
              });
            },
          });

          return new Ok(permissions);
        },
        constrainSuccessResult: (permissions) => ({
          type: 'success',
          result: permissions,
        }),
      });
    },
  });

  return listViewPermissionsTool;
};
