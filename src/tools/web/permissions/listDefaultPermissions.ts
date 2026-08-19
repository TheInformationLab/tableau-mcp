import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { useRestApi } from '../../../restApiInstance.js';
import {
  defaultPermissionResourceTypeSchema,
  Permissions,
} from '../../../sdks/tableau/types/permissions.js';
import { WebMcpServer } from '../../../server.web.js';
import { formatCapabilitiesForDisplay } from '../../../utils/permissions/capabilityValidator.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  projectId: z.string().describe('The LUID of the project'),
  resourceType: defaultPermissionResourceTypeSchema.describe(
    'Resource type: workbooks, datasources, flows, metrics, lenses, dataroles, virtualconnections, databases, tables',
  ),
};

export const getListDefaultPermissionsTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const listDefaultPermissionsTool = new WebTool({
    server,
    name: 'list-default-permissions',
    description: `
Returns the default permissions for a specific resource type within a project. Default permissions are applied to new content created in the project.

**Parameters:**
- \`projectId\` (required): The LUID of the project
- \`resourceType\` (required): The type of resource. Valid values: workbooks, datasources, flows, metrics, lenses, dataroles, virtualconnections, databases, tables

**Example Usage:**
- List default workbook permissions for a project:
    projectId: "abc123-def456"
    resourceType: "workbooks"

**Valid Capabilities by Resource Type:**
- workbooks: ${formatCapabilitiesForDisplay('workbooks')}
- datasources: ${formatCapabilitiesForDisplay('datasources')}
- flows: ${formatCapabilitiesForDisplay('flows')}
`,
    paramsSchema,
    annotations: {
      title: 'List Default Permissions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ projectId, resourceType }, extra): Promise<CallToolResult> => {
      return await listDefaultPermissionsTool.logAndExecute<Permissions>({
        extra,
        args: { projectId, resourceType },
        callback: async () => {
          const permissions = await useRestApi({
            ...extra,
            jwtScopes: listDefaultPermissionsTool.requiredApiScopes,
            callback: async (restApi) => {
              return await restApi.permissionsMethods.getDefaultPermissions({
                siteId: restApi.siteId,
                projectId,
                resourceType,
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

  return listDefaultPermissionsTool;
};
