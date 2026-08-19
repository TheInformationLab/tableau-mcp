import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { AdminOnlyError, UnknownError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Job } from '../../../sdks/tableau/types/extractRefreshTask.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  taskId: z.string().describe('The LUID of the extract refresh task to run.'),
};

export const getRunExtractRefreshTaskTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const runExtractRefreshTaskTool = new WebTool({
    server,
    name: 'run-extract-refresh-task',
    disabled: !config.adminToolsEnabled,
    description: `
  Runs an extract refresh task immediately, outside of its normal schedule. Returns a Job whose id can be polled via list-jobs to track progress.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  Use this tool when you need to:
  - Trigger an ad-hoc data refresh
  - Test a newly created extract refresh task
  - Manually refresh data after upstream changes

  **Parameters:**
  - \`taskId\` (required) – The LUID of the extract refresh task to run.

  **Response:** A Job object with the queued job's \`id\`. The refresh runs asynchronously — this tool returns immediately after the job is queued. This does NOT modify the task's schedule.

  Tableau REST API scope: \`tableau:tasks:run\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Run Extract Refresh Task',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async ({ taskId }, extra): Promise<CallToolResult> => {
      return await runExtractRefreshTaskTool.logAndExecute<Job>({
        extra,
        args: { taskId },
        callback: async () => {
          return await useRestApi({
            ...extra,
            jwtScopes: runExtractRefreshTaskTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                return new AdminOnlyError(adminResult.error).toErr();
              }

              try {
                const job = await restApi.tasksMethods.runExtractRefreshTask({
                  siteId: restApi.siteId,
                  taskId,
                });
                return new Ok(job);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return new Err(
                  new UnknownError(`Failed to run extract refresh task '${taskId}': ${message}`),
                );
              }
            },
          });
        },
        constrainSuccessResult: (job) => ({ type: 'success', result: job }),
      });
    },
  });

  return runExtractRefreshTaskTool;
};
