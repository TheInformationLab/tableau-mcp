import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { UnknownError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { WebMcpServer } from '../../../server.web.js';
import {
  formatCapabilitiesForDisplay,
  validateCapability,
} from '../../../utils/permissions/capabilityValidator.js';
import { RegistryEvidence } from '../_lib/evidence.js';
import { guardMutation, MutationTarget } from '../_lib/mutationGuard.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  resourceType: z
    .enum(['projects', 'workbooks', 'datasources', 'views'])
    .describe('The type of resource'),
  resourceId: z.string().describe('The LUID of the resource'),
  granteeType: z.enum(['users', 'groups']).describe("'users' or 'groups'"),
  granteeId: z.string().describe('The LUID of the user or group'),
  capabilityName: z.string().describe('The name of the capability to remove'),
  capabilityMode: z.enum(['Allow', 'Deny']).describe('The mode of the capability'),
  confirm: z
    .boolean()
    .optional()
    .describe(
      'When omitted or false, previews the deletion and returns a single-use token. When true, deletes the permission (requires confirmationToken).',
    ),
  confirmationToken: z
    .string()
    .optional()
    .describe('Confirmation token from a prior preview call. Required when `confirm` is true.'),
};

export const getDeletePermissionTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();
  const deletePermissionTool = new WebTool({
    server,
    name: 'delete-permission',
    disabled: !config.adminToolsEnabled,
    description: `
**WARNING: This tool removes a specific permission capability from a Tableau resource.**

This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag.

**Two-phase (preview → confirm):**

1. **Preview (default — \`confirm\` omitted or false):** returns the deletion that would be applied plus a single-use \`confirmationToken\`. Nothing is changed.
2. **Delete (\`confirm: true\`):** deletes the capability. Requires \`confirmationToken\` from a prior preview of the SAME parameters.

**Parameters:**
- \`resourceType\` (required): projects, workbooks, datasources, or views
- \`resourceId\` (required): The LUID of the resource
- \`granteeType\` (required): 'users' or 'groups'
- \`granteeId\` (required): The LUID of the user or group
- \`capabilityName\` (required): The name of the capability
- \`capabilityMode\` (required): 'Allow' or 'Deny'
- \`confirm\` (optional): Set true to delete
- \`confirmationToken\` (optional): Required when confirm is true

**Valid Capabilities by Resource Type:**
- projects: ${formatCapabilitiesForDisplay('projects')}
- workbooks: ${formatCapabilitiesForDisplay('workbooks')}
- datasources: ${formatCapabilitiesForDisplay('datasources')}
- views: ${formatCapabilitiesForDisplay('views')}
`,
    paramsSchema,
    annotations: {
      title: 'Delete Permission',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (args, extra): Promise<CallToolResult> => {
      return await deletePermissionTool.logAndExecute<string>({
        extra,
        args,
        callback: async () => {
          const validationResult = validateCapability(args.resourceType, args.capabilityName);
          if (validationResult.isErr()) {
            return new UnknownError(validationResult.error.message, 400).toErr();
          }

          return await useRestApi({
            ...extra,
            jwtScopes: deletePermissionTool.requiredApiScopes,
            callback: async (restApi) => {
              const evidence = new RegistryEvidence();
              const binding = `${args.resourceType}:${args.resourceId}:${args.granteeType}:${args.granteeId}:${args.capabilityName}:${args.capabilityMode}`;

              const resolveTarget = async (): Promise<MutationTarget> => ({
                id: binding,
                kind: 'permission',
              });

              const guardResult = await guardMutation({
                restApi,
                extra,
                tool: 'delete-permission',
                action: 'delete',
                mode: 'preview-confirm',
                phase: args.confirm ? 'confirm' : 'preview',
                evidence,
                resolveTarget,
                confirmationToken: args.confirmationToken,
                binding,
                fallbackTargetKind: 'permission',
              });
              if (guardResult.isErr()) {
                return guardResult.error.toErr();
              }
              const { recordOutcome } = guardResult.value;

              if (!args.confirm) {
                const nonce = evidence.getEstablishedNonce()!;
                return new Ok(
                  `Preview — would delete ${args.capabilityName}:${args.capabilityMode} ` +
                    `for ${args.granteeType} '${args.granteeId}' on ${args.resourceType} '${args.resourceId}'. ` +
                    'Nothing has been changed. ' +
                    'NEXT STEP — REQUIRED: get explicit approval from the user before deleting. ' +
                    `Then call again with confirm: true and confirmationToken: "${nonce}".`,
                );
              }

              try {
                await applyDelete(restApi, args);
                recordOutcome({ ok: true });
                return new Ok(
                  `Permission ${args.capabilityName}:${args.capabilityMode} deleted from ` +
                    `${args.resourceType} '${args.resourceId}' for ${args.granteeType} '${args.granteeId}'.`,
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                recordOutcome({ ok: false, failureDetail: message });
                return new UnknownError(`Failed to delete permission: ${message}`).toErr();
              }
            },
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return deletePermissionTool;
};

async function applyDelete(
  restApi: {
    siteId: string;
    permissionsMethods: {
      deleteProjectPermission: (input: {
        siteId: string;
        projectId: string;
        granteeType: string;
        granteeId: string;
        capabilityName: string;
        capabilityMode: string;
      }) => Promise<void>;
      deleteWorkbookPermission: (input: {
        siteId: string;
        workbookId: string;
        granteeType: string;
        granteeId: string;
        capabilityName: string;
        capabilityMode: string;
      }) => Promise<void>;
      deleteDatasourcePermission: (input: {
        siteId: string;
        datasourceId: string;
        granteeType: string;
        granteeId: string;
        capabilityName: string;
        capabilityMode: string;
      }) => Promise<void>;
      deleteViewPermission: (input: {
        siteId: string;
        viewId: string;
        granteeType: string;
        granteeId: string;
        capabilityName: string;
        capabilityMode: string;
      }) => Promise<void>;
    };
  },
  args: {
    resourceType: 'projects' | 'workbooks' | 'datasources' | 'views';
    resourceId: string;
    granteeType: 'users' | 'groups';
    granteeId: string;
    capabilityName: string;
    capabilityMode: 'Allow' | 'Deny';
  },
): Promise<void> {
  const { granteeType, granteeId, capabilityName, capabilityMode } = args;
  switch (args.resourceType) {
    case 'projects':
      await restApi.permissionsMethods.deleteProjectPermission({
        siteId: restApi.siteId,
        projectId: args.resourceId,
        granteeType,
        granteeId,
        capabilityName,
        capabilityMode,
      });
      return;
    case 'workbooks':
      await restApi.permissionsMethods.deleteWorkbookPermission({
        siteId: restApi.siteId,
        workbookId: args.resourceId,
        granteeType,
        granteeId,
        capabilityName,
        capabilityMode,
      });
      return;
    case 'datasources':
      await restApi.permissionsMethods.deleteDatasourcePermission({
        siteId: restApi.siteId,
        datasourceId: args.resourceId,
        granteeType,
        granteeId,
        capabilityName,
        capabilityMode,
      });
      return;
    case 'views':
      await restApi.permissionsMethods.deleteViewPermission({
        siteId: restApi.siteId,
        viewId: args.resourceId,
        granteeType,
        granteeId,
        capabilityName,
        capabilityMode,
      });
      return;
  }
}
