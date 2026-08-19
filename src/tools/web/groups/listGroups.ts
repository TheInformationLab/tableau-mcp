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
import { genericFilterDescription } from '../genericFilterDescription.js';
import { ConstrainedResult, WebTool } from '../tool.js';
import { parseAndValidateGroupsFilterString } from './groupsFilterUtils.js';

const paramsSchema = {
  filter: z.string().optional(),
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
    .describe('The maximum number of groups to return from the requested page (must be <= 1000).'),
};

export const getListGroupsTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const listGroupsTool = new WebTool({
    server,
    name: 'list-groups',
    disabled: !config.adminToolsEnabled,
    description: `
  Retrieves a list of groups from a specified Tableau site using the Tableau REST API. Groups are used to organize users and manage permissions. Supports optional filtering via field:operator:value expressions.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Supported Filter Fields and Operators**
  | Field           | Operators   |
  |-----------------|-------------|
  | name            | eq, in, has |
  | domainName      | eq, in, has |
  | minimumSiteRole | eq, in      |
  | isLocal         | eq          |

  ${genericFilterDescription}

  **Example Usage:**
  - List all groups on a site
  - List groups with the name "Marketing": \`filter: "name:eq:Marketing"\`
  - List local groups: \`filter: "isLocal:eq:true"\`
  - List groups with a minimum site role of Creator: \`filter: "minimumSiteRole:eq:Creator"\`

  **Pagination**
  This tool returns a single 1000-item page per call. Use \`pageNumber\` to select which 1-based page to fetch (default 1).

  Tableau REST API scope: \`tableau:groups:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'List Groups',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ filter, pageNumber, limit }, extra): Promise<CallToolResult> => {
      const configWithOverrides = await extra.getConfigWithOverrides();
      const maxResultLimit = configWithOverrides.getMaxResultLimit(listGroupsTool.name);

      return await listGroupsTool.logAndExecute({
        extra,
        args: { filter, pageNumber, limit },
        callback: async () => {
          // Parse the filter INSIDE the executed callback so an invalid filter surfaces
          // as a clean `isError` tool result rather than an uncaught ZodError throw.
          const validatedFilter = filter ? parseAndValidateGroupsFilterString(filter) : undefined;
          const msg = getPageExceedsLimitMessage({ pageNumber, maxResultLimit });
          if (msg) return new PageExceedsLimitError(msg).toErr();

          return new Ok(
            await useRestApi({
              ...extra,
              jwtScopes: listGroupsTool.requiredApiScopes,
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
                    const { pagination, groups: data } = await restApi.groupsMethods.listGroups({
                      siteId: restApi.siteId,
                      filter: validatedFilter,
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
        constrainSuccessResult: (page) => constrainGroups(page),
      });
    },
  });

  return listGroupsTool;
};

export function constrainGroups(page: {
  data: Array<Group>;
  totalAvailable: number;
}): ConstrainedResult<{ data: Array<Group>; totalAvailable: number }> {
  if (page.data.length === 0) {
    return {
      type: 'empty',
      message:
        'No groups were found. Either none exist or you do not have permission to view them.',
    };
  }
  return { type: 'success', result: page };
}
