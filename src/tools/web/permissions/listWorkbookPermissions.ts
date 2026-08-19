import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { useRestApi } from '../../../restApiInstance.js';
import { Permissions } from '../../../sdks/tableau/types/permissions.js';
import { WebMcpServer } from '../../../server.web.js';
import { formatCapabilitiesForDisplay } from '../../../utils/permissions/capabilityValidator.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  workbookId: z.string().describe('The LUID of the workbook'),
};

export const getListWorkbookPermissionsTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const listWorkbookPermissionsTool = new WebTool({
    server,
    name: 'list-workbook-permissions',
    description: `
Returns the permissions for the specified workbook, showing which users and groups have access and what capabilities they have.

**Parameters:**
- \`workbookId\` (required): The LUID of the workbook

**Valid Workbook Capabilities:**
${formatCapabilitiesForDisplay('workbooks')}

**Example Usage:**
- List permissions for a workbook:
    workbookId: "abc123-def456"
`,
    paramsSchema,
    annotations: {
      title: 'List Workbook Permissions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ workbookId }, extra): Promise<CallToolResult> => {
      return await listWorkbookPermissionsTool.logAndExecute<Permissions>({
        extra,
        args: { workbookId },
        callback: async () => {
          const permissions = await useRestApi({
            ...extra,
            jwtScopes: listWorkbookPermissionsTool.requiredApiScopes,
            callback: async (restApi) => {
              return await restApi.permissionsMethods.getWorkbookPermissions({
                siteId: restApi.siteId,
                workbookId,
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

  return listWorkbookPermissionsTool;
};
