import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { AdminOnlyError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { ExtractRefreshTask } from '../../../sdks/tableau/types/extractRefreshTask.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { ConstrainedResult, WebTool } from '../tool.js';

const paramsSchema = {
  taskId: z.string().describe('The LUID of the extract refresh task. Obtain from list-extract-refresh-tasks.'),
};

export const getGetExtractRefreshTaskTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const getExtractRefreshTaskTool = new WebTool({
    server,
    name: 'get-extract-refresh-task',
    disabled: !config.adminToolsEnabled,
    description: `
  Retrieves the details of a single extract refresh task by its ID, including its schedule (frequency, next run time), the workbook or datasource it targets, and the consecutive failure count for troubleshooting.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  Use this tool when you need to:
  - Inspect a specific task's schedule and configuration
  - Check the consecutive failure count for a task
  - Verify a task's next scheduled run time

  **Parameters:**
  - \`taskId\` (required) – The LUID of the extract refresh task.

  **Response:** The task record, including \`id\`, \`type\`, \`priority\`, \`consecutiveFailedCount\`, \`workbook\`/\`datasource\` reference, and \`schedule\`.

  Tableau REST API scope: \`tableau:tasks:read\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Get Extract Refresh Task',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ taskId }, extra): Promise<CallToolResult> => {
      return await getExtractRefreshTaskTool.logAndExecute<ExtractRefreshTask>({
        extra,
        args: { taskId },
        callback: async () => {
          return await useRestApi({
            ...extra,
            jwtScopes: getExtractRefreshTaskTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                return new AdminOnlyError(adminResult.error).toErr();
              }

              const task = await restApi.tasksMethods.getExtractRefreshTask({
                siteId: restApi.siteId,
                taskId,
              });
              return new Ok(task);
            },
          });
        },
        constrainSuccessResult: (task) => constrainExtractRefreshTask({ task }),
      });
    },
  });

  return getExtractRefreshTaskTool;
};

export function constrainExtractRefreshTask({
  task,
}: {
  task: ExtractRefreshTask;
}): ConstrainedResult<ExtractRefreshTask> {
  return { type: 'success', result: task };
}
