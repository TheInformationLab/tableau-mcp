import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { PageExceedsLimitError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Group } from '../../../sdks/tableau/types/group.js';
import { WebMcpServer } from '../../../server.web.js';
import { getPage, getPageExceedsLimitMessage, MAX_PAGE_SIZE } from '../../../utils/paginate.js';
import { assertAdmin } from '../adminGate.js';
import { ConstrainedResult, WebTool } from '../tool.js';

const paramsSchema = {
  userId: z.string().describe('The LUID of the user whose groups will be listed.'),
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
    .describe('Maximum number of groups to return from the requested page (must be <= 1000).'),
};

export const getListGroupsForUserTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const listGroupsForUserTool = new WebTool({
    server,
    name: 'list-groups-for-user',
    disabled: !config.adminToolsEnabled,
    description: `
  Retrieves a list of groups that the specified user belongs to.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`userId\` (required) – The LUID of the user.
  - \`pageNumber\` (optional) – 1-based page number (default 1).
  - \`limit\` (optional) – Maximum items to return from the requested page (<= 1000).

  **Response:** \`{ data, totalAvailable }\` — a single page of groups plus the total count.

  Tableau REST API scope: \`tableau:groups:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'List Groups for User',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ userId, pageNumber, limit }, extra): Promise<CallToolResult> => {
      const configWithOverrides = await extra.getConfigWithOverrides();
      const maxResultLimit = configWithOverrides.getMaxResultLimit(listGroupsForUserTool.name);

      return await listGroupsForUserTool.logAndExecute({
        extra,
        args: { userId, pageNumber, limit },
        callback: async () => {
          const msg = getPageExceedsLimitMessage({ pageNumber, maxResultLimit });
          if (msg) return new PageExceedsLimitError(msg).toErr();

          return new Ok(
            await useRestApi({
              ...extra,
              jwtScopes: listGroupsForUserTool.requiredApiScopes,
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
                    const { pagination, groups: data } =
                      await restApi.usersMethods.listGroupsForUser({
                        siteId: restApi.siteId,
                        userId,
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
        constrainSuccessResult: (page) => constrainGroupsForUser(page),
      });
    },
  });

  return listGroupsForUserTool;
};

function constrainGroupsForUser(page: {
  data: Array<Group>;
  totalAvailable: number;
}): ConstrainedResult<{ data: Array<Group>; totalAvailable: number }> {
  if (page.data.length === 0) {
    return { type: 'empty', message: 'The user is not a member of any groups.' };
  }
  return { type: 'success', result: page };
}
