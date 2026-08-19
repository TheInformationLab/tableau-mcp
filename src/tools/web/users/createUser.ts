import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { useRestApi } from '../../../restApiInstance.js';
import { User } from '../../../sdks/tableau/types/user.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { WebTool } from '../tool.js';

// Site-role values Tableau accepts for POST /sites/.../users. ServerAdministrator is server-scoped
// (not assignable via this endpoint); SupportUser is internal only.
const VALID_SITE_ROLES = [
  'Creator',
  'Explorer',
  'ExplorerCanPublish',
  'SiteAdministratorCreator',
  'SiteAdministratorExplorer',
  'Viewer',
  'Unlicensed',
] as const;

const paramsSchema = {
  name: z.string().min(1).describe('The username for the new user.'),
  siteRole: z
    .enum(VALID_SITE_ROLES)
    .describe(
      'Site role for the new user. Valid values: Creator, Explorer, ExplorerCanPublish, ' +
        'SiteAdministratorCreator, SiteAdministratorExplorer, Viewer, Unlicensed.',
    ),
  authSetting: z
    .string()
    .optional()
    .describe('The authentication type (e.g. ServerDefault, SAML). Optional.'),
};

export const getCreateUserTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const createUserTool = new WebTool({
    server,
    name: 'create-user',
    disabled: !config.adminToolsEnabled,
    description: `
  Adds a new user to the specified Tableau site.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`name\` (required) – The username for the new user.
  - \`siteRole\` (required) – Site role. Valid values: Creator, Explorer, ExplorerCanPublish, SiteAdministratorCreator, SiteAdministratorExplorer, Viewer, Unlicensed.
  - \`authSetting\` (optional) – The authentication type (e.g. ServerDefault, SAML).

  **Response:** The created user record including the assigned LUID.

  Tableau REST API scopes: \`tableau:users:create\`, \`tableau:users:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Create User',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async ({ name, siteRole, authSetting }, extra): Promise<CallToolResult> => {
      return await createUserTool.logAndExecute<User>({
        extra,
        args: { name, siteRole, authSetting },
        callback: async () => {
          const user = await useRestApi({
            ...extra,
            jwtScopes: createUserTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                throw new Error(adminResult.error);
              }
              return await restApi.usersMethods.createUser({
                siteId: restApi.siteId,
                user: {
                  name,
                  siteRole,
                  authSetting,
                },
              });
            },
          });

          return new Ok(user);
        },
        constrainSuccessResult: (user) => ({ type: 'success', result: user }),
      });
    },
  });

  return createUserTool;
};
