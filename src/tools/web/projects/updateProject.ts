import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import {
  AdminOnlyError,
  ProjectNotAllowedError,
  UnknownError,
} from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Project } from '../../../sdks/tableau/types/project.js';
import { WebMcpServer } from '../../../server.web.js';
import { assertAdmin } from '../adminGate.js';
import { resourceAccessChecker } from '../resourceAccessChecker.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  projectId: z.string().describe('The LUID of the project to update.'),
  name: z.string().min(1).optional().describe('New name for the project.'),
  description: z.string().optional().describe('New description for the project.'),
  contentPermissions: z
    .enum(['LockedToProject', 'ManagedByOwner', 'LockedToProjectWithoutNested'])
    .optional()
    .describe('New content-permissions model. See create-project for the values and their meaning.'),
  parentProjectId: z
    .string()
    .optional()
    .describe('New parent project LUID. Use to move the project under a different parent.'),
  ownerId: z.string().optional().describe('New owner user LUID.'),
};

export const getUpdateProjectTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const updateProjectTool = new WebTool({
    server,
    name: 'update-project',
    disabled: !config.adminToolsEnabled,
    description: `
  Updates an existing project on the Tableau site. Modify the project's name, description, permissions model, parent project (to move it), or owner.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`projectId\` (required) – The LUID of the project to update. Obtain from \`list-projects\`.
  - \`name\` (optional) – New name for the project.
  - \`description\` (optional) – New description for the project.
  - \`contentPermissions\` (optional) – \`LockedToProject\`, \`ManagedByOwner\`, or \`LockedToProjectWithoutNested\`.
  - \`parentProjectId\` (optional) – New parent project LUID (to move the project). When bounded-context project filtering is enabled, both the source and destination projects MUST be allowed.
  - \`ownerId\` (optional) – New owner user LUID.

  **Response:** The updated project object.

  Tableau REST API scope: \`tableau:projects:update\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Update Project',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async (
      { projectId, name, description, contentPermissions, parentProjectId, ownerId },
      extra,
    ): Promise<CallToolResult> => {
      return await updateProjectTool.logAndExecute<Project>({
        extra,
        args: { projectId, name, description, contentPermissions, parentProjectId, ownerId },
        callback: async () => {
          return await useRestApi({
            ...extra,
            jwtScopes: updateProjectTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                return new AdminOnlyError(adminResult.error).toErr();
              }

              // Verify the target project is within bounded context.
              const targetAllowed = await resourceAccessChecker.isProjectAllowed({
                projectId,
                extra,
              });
              if (!targetAllowed.allowed) {
                return new ProjectNotAllowedError(targetAllowed.message).toErr();
              }

              // If moving under a new parent, verify the destination too so a move can't
              // exfiltrate content from the bounded set.
              if (parentProjectId) {
                const parentAllowed = await resourceAccessChecker.isProjectAllowed({
                  projectId: parentProjectId,
                  extra,
                });
                if (!parentAllowed.allowed) {
                  return new ProjectNotAllowedError(parentAllowed.message).toErr();
                }
              }

              try {
                const project = await restApi.projectsMethods.updateProject({
                  siteId: restApi.siteId,
                  projectId,
                  project: {
                    name,
                    description,
                    contentPermissions,
                    parentProjectId,
                    ownerId,
                  },
                });
                return new Ok(project);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return new Err(
                  new UnknownError(`Failed to update project '${projectId}': ${message}`),
                );
              }
            },
          });
        },
        constrainSuccessResult: (project) => ({ type: 'success', result: project }),
      });
    },
  });

  return updateProjectTool;
};
