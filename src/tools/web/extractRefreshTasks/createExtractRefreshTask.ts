import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { AdminOnlyError, ArgsValidationError, UnknownError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import {
  createExtractRefreshTaskFrequencyDetailsSchema,
  ExtractRefreshSchedule,
  ExtractRefreshTask,
} from '../../../sdks/tableau/types/extractRefreshTask.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  type: z
    .enum(['FullRefresh', 'IncrementalRefresh'])
    .describe('"FullRefresh" replaces all data; "IncrementalRefresh" appends new data.'),
  workbookId: z
    .string()
    .optional()
    .describe('LUID of the workbook to refresh. Exactly one of workbookId or datasourceId is required.'),
  datasourceId: z
    .string()
    .optional()
    .describe('LUID of the datasource to refresh. Exactly one of workbookId or datasourceId is required.'),
  frequency: z
    .enum(['Hourly', 'Daily', 'Weekly', 'Monthly'])
    .describe('How often the refresh runs.'),
  frequencyDetails: createExtractRefreshTaskFrequencyDetailsSchema
    .optional()
    .describe('Optional detailed timing (start/end times, weekDay/monthDay intervals).'),
};

export const getCreateExtractRefreshTaskTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const createExtractRefreshTaskTool = new WebTool({
    server,
    name: 'create-extract-refresh-task',
    disabled: !config.adminToolsEnabled,
    description: `
  Creates a new scheduled extract refresh task for a workbook or datasource on Tableau Cloud.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Tableau Cloud only** (API 3.20+).

  **Parameters:**
  - \`type\` (required) – \`FullRefresh\` (replace all data) or \`IncrementalRefresh\` (append new).
  - \`workbookId\` OR \`datasourceId\` (exactly one required) – The target's LUID.
  - \`frequency\` (required) – \`Hourly\`, \`Daily\`, \`Weekly\`, or \`Monthly\`.
  - \`frequencyDetails\` (optional) – Detailed timing:
    - \`start\`: start time in \`HH:MM:SS\`
    - \`end\`: end time in \`HH:MM:SS\` (for Hourly)
    - \`intervals.interval\`: array of \`{ weekDay | monthDay | hours | minutes }\` entries

  **Example (Daily at 02:00):**
  \`\`\`
  { "type": "FullRefresh", "datasourceId": "abc123", "frequency": "Daily",
    "frequencyDetails": { "start": "02:00:00" } }
  \`\`\`

  **Example (Weekly Mon/Fri at 06:00):**
  \`\`\`
  { "type": "IncrementalRefresh", "workbookId": "xyz789", "frequency": "Weekly",
    "frequencyDetails": { "start": "06:00:00",
      "intervals": { "interval": [ { "weekDay": "Monday" }, { "weekDay": "Friday" } ] } } }
  \`\`\`

  Tableau REST API scope: \`tableau:tasks:create\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Create Extract Refresh Task',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (
      { type, workbookId, datasourceId, frequency, frequencyDetails },
      extra,
    ): Promise<CallToolResult> => {
      return await createExtractRefreshTaskTool.logAndExecute<{
        extractRefresh: Partial<ExtractRefreshTask>;
        schedule?: ExtractRefreshSchedule;
      }>({
        extra,
        args: { type, workbookId, datasourceId, frequency, frequencyDetails },
        callback: async () => {
          if ((!workbookId && !datasourceId) || (workbookId && datasourceId)) {
            return new Err(
              new ArgsValidationError('Exactly one of workbookId or datasourceId must be provided.'),
            );
          }

          return await useRestApi({
            ...extra,
            jwtScopes: createExtractRefreshTaskTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                return new AdminOnlyError(adminResult.error).toErr();
              }

              try {
                const result = await restApi.tasksMethods.createExtractRefreshTask({
                  siteId: restApi.siteId,
                  type,
                  workbookId,
                  datasourceId,
                  frequency,
                  frequencyDetails,
                });
                return new Ok(result);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return new Err(
                  new UnknownError(`Failed to create extract refresh task: ${message}`),
                );
              }
            },
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return createExtractRefreshTaskTool;
};
