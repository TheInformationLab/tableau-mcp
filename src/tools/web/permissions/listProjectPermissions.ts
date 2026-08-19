import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { useRestApi } from '../../../restApiInstance.js';
import { Permissions } from '../../../sdks/tableau/types/permissions.js';
import { WebMcpServer } from '../../../server.web.js';
import { formatCapabilitiesForDisplay } from '../../../utils/permissions/capabilityValidator.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  projectId: z.string().describe('The LUID of the project'),
};

export const getListProjectPermissionsTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const listProjectPermissionsTool = new WebTool({
    server,
    name: 'list-project-permissions',
    description: `
Returns the permissions for the specified project, showing which users and groups have access and what capabilities they have.

**Parameters:**
- \`projectId\` (required): The LUID of the project

**Valid Project Capabilities:**
${formatCapabilitiesForDisplay('projects')}

**Example Usage:**
- List permissions for a project:
    projectId: "abc123-def456"
`,
    paramsSchema,
    annotations: {
      title: 'List Project Permissions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ projectId }, extra): Promise<CallToolResult> => {
      return await listProjectPermissionsTool.logAndExecute<Permissions>({
        extra,
        args: { projectId },
        callback: async () => {
          const permissions = await useRestApi({
            ...extra,
            jwtScopes: listProjectPermissionsTool.requiredApiScopes,
            callback: async (restApi) => {
              return await restApi.permissionsMethods.getProjectPermissions({
                siteId: restApi.siteId,
                projectId,
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

  return listProjectPermissionsTool;
};
