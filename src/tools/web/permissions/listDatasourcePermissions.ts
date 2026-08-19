import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { useRestApi } from '../../../restApiInstance.js';
import { Permissions } from '../../../sdks/tableau/types/permissions.js';
import { WebMcpServer } from '../../../server.web.js';
import { formatCapabilitiesForDisplay } from '../../../utils/permissions/capabilityValidator.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  datasourceId: z.string().describe('The LUID of the datasource'),
};

export const getListDatasourcePermissionsTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const listDatasourcePermissionsTool = new WebTool({
    server,
    name: 'list-datasource-permissions',
    description: `
Returns the permissions for the specified datasource, showing which users and groups have access and what capabilities they have.

**Parameters:**
- \`datasourceId\` (required): The LUID of the datasource

**Valid Datasource Capabilities:**
${formatCapabilitiesForDisplay('datasources')}

**Example Usage:**
- List permissions for a datasource:
    datasourceId: "abc123-def456"
`,
    paramsSchema,
    annotations: {
      title: 'List Datasource Permissions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ datasourceId }, extra): Promise<CallToolResult> => {
      return await listDatasourcePermissionsTool.logAndExecute<Permissions>({
        extra,
        args: { datasourceId },
        callback: async () => {
          const permissions = await useRestApi({
            ...extra,
            jwtScopes: listDatasourcePermissionsTool.requiredApiScopes,
            callback: async (restApi) => {
              return await restApi.permissionsMethods.getDatasourcePermissions({
                siteId: restApi.siteId,
                datasourceId,
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

  return listDatasourcePermissionsTool;
};
