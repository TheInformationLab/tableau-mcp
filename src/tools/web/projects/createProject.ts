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
  name: z.string().min(1).describe('The name of the new project.'),
  description: z.string().optional().describe('An optional description of the project.'),
  contentPermissions: z
    .enum(['LockedToProject', 'ManagedByOwner', 'LockedToProjectWithoutNested'])
    .optional()
    .describe(
      'How permissions are managed. "LockedToProject" locks all content to the project owner’s ' +
        'permissions, "ManagedByOwner" lets content owners manage their own permissions, ' +
        '"LockedToProjectWithoutNested" locks the project but excludes nested projects.',
    ),
  parentProjectId: z
    .string()
    .optional()
    .describe(
      'LUID of the parent project to create a nested project. Omit to create a top-level project.',
    ),
};

export const getCreateProjectTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();

  const createProjectTool = new WebTool({
    server,
    name: 'create-project',
    disabled: !config.adminToolsEnabled,
    description: `
  Creates a new project on the Tableau site. Projects organize content (workbooks, datasources, flows, views) and are the primary permissions boundary.

  This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag to be enabled.

  **Parameters:**
  - \`name\` (required) – The name of the new project.
  - \`description\` (optional) – A description of the project.
  - \`contentPermissions\` (optional) – Controls how permissions cascade to content:
    - \`LockedToProject\`: content inherits the project's permissions (strict governance)
    - \`ManagedByOwner\`: content owners manage permissions independently (default Tableau behavior)
    - \`LockedToProjectWithoutNested\`: locks the project but excludes nested projects
  - \`parentProjectId\` (optional) – LUID of a parent project to create a nested project. When bounded-context project filtering is enabled, the parent MUST be an allowed project.

  **Response:** The created project object, including its assigned LUID.

  Tableau REST API scope: \`tableau:projects:create\`.
  `,
    paramsSchema,
    annotations: {
      title: 'Create Project',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (
      { name, description, contentPermissions, parentProjectId },
      extra,
    ): Promise<CallToolResult> => {
      return await createProjectTool.logAndExecute<Project>({
        extra,
        args: { name, description, contentPermissions, parentProjectId },
        callback: async () => {
          return await useRestApi({
            ...extra,
            jwtScopes: createProjectTool.requiredApiScopes,
            callback: async (restApi) => {
              const adminResult = await assertAdmin(restApi, extra);
              if (adminResult.isErr()) {
                return new AdminOnlyError(adminResult.error).toErr();
              }

              // If a parent project was requested and bounded-context project filtering is
              // active, refuse to nest under a project the caller cannot see. Top-level
              // creates skip the check because there is no parent to validate.
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
                const project = await restApi.projectsMethods.createProject({
                  siteId: restApi.siteId,
                  project: {
                    name,
                    description,
                    contentPermissions,
                    parentProjectId,
                  },
                });
                return new Ok(project);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return new Err(new UnknownError(`Failed to create project '${name}': ${message}`));
              }
            },
          });
        },
        constrainSuccessResult: (project) => ({ type: 'success', result: project }),
      });
    },
  });

  return createProjectTool;
};
