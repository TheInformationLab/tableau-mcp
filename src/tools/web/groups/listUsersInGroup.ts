import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { PageExceedsLimitError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { User } from '../../../sdks/tableau/types/user.js';
import { WebMcpServer } from '../../../server.web.js';
import { getPage, getPageExceedsLimitMessage, MAX_PAGE_SIZE } from '../../../utils/paginate.js';
import { assertAdmin } from '../adminGate.js';
import { ConstrainedResult, WebTool } from '../tool.js';

const paramsSchema = {
  groupId: z.string().describe('The LUID of the group whose members will be listed.'),
  pageNumber: z
    .number()
    .int()
    .gt(0)
    .optional()
    .describe('Which 1000-item page to fetch (1-based, default 1).'),
  limit: z
    .number()
    .int()
    .gt(0)
    .max(MAX_PAGE_SIZE)
    .optional()
    .describe('Maximum number of users to return from the requested page (must be <= 1000).'),
};

export const getListUsersInGroupTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const listUsersInGroupTool = new WebTool({
    server,
    name: 'list-users-in-group',
    disabled: !config.adminToolsEnabled,
    description: `
  Retrieves a list of users that are members of the specified group.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`groupId\` (required) – The LUID of the group.
  - \`pageNumber\` (optional) – 1-based page number (default 1).
  - \`limit\` (optional) – Maximum items to return from the requested page (<= 1000).

  **Response:** \`{ data, totalAvailable }\` — a single page of users plus the total count.

  Tableau REST API scope: \`tableau:groups:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'List Users in Group',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ groupId, pageNumber, limit }, extra): Promise<CallToolResult> => {
      const configWithOverrides = await extra.getConfigWithOverrides();
      const maxResultLimit = configWithOverrides.getMaxResultLimit(listUsersInGroupTool.name);

      return await listUsersInGroupTool.logAndExecute({
        extra,
        args: { groupId, pageNumber, limit },
        callback: async () => {
          const msg = getPageExceedsLimitMessage({ pageNumber, maxResultLimit });
          if (msg) return new PageExceedsLimitError(msg).toErr();

          return new Ok(
            await useRestApi({
              ...extra,
              jwtScopes: listUsersInGroupTool.requiredApiScopes,
              callback: async (restApi) => {
                const adminResult = await assertAdmin(restApi, extra);
                if (adminResult.isErr()) {
                  throw new Error(adminResult.error);
                }
                return await getPage({
                  pageNumber,
                  limit,
                  maxResultLimit,
                  getDataFn: async ({ pageSize, pageNumber }) => {
                    const { pagination, users: data } =
                      await restApi.groupsMethods.listUsersInGroup({
                        siteId: restApi.siteId,
                        groupId,
                        pageSize,
                        pageNumber,
                      });
                    return {
                      pagination: pagination ?? { pageNumber, pageSize, totalAvailable: data.length },
                      data,
                    };
                  },
                });
              },
            }),
          );
        },
        constrainSuccessResult: (page) => constrainUsersInGroup(page),
      });
    },
  });

  return listUsersInGroupTool;
};

function constrainUsersInGroup(page: {
  data: Array<User>;
  totalAvailable: number;
}): ConstrainedResult<{ data: Array<User>; totalAvailable: number }> {
  if (page.data.length === 0) {
    return { type: 'empty', message: 'The group has no members.' };
  }
  return { type: 'success', result: page };
}
