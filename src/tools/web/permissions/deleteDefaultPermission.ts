import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { UnknownError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { defaultPermissionResourceTypeSchema } from '../../../sdks/tableau/types/permissions.js';
import { WebMcpServer } from '../../../server.web.js';
import {
  formatCapabilitiesForDisplay,
  validateCapability,
} from '../../../utils/permissions/capabilityValidator.js';
import { RegistryEvidence } from '../_lib/evidence.js';
import { guardMutation, MutationTarget } from '../_lib/mutationGuard.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  projectId: z.string().describe('The LUID of the project'),
  resourceType: defaultPermissionResourceTypeSchema.describe(
    'Resource type: workbooks, datasources, flows, metrics, lenses, dataroles, virtualconnections, databases, tables',
  ),
  granteeType: z.enum(['users', 'groups']).describe("'users' or 'groups'"),
  granteeId: z.string().describe('The LUID of the user or group'),
  capabilityName: z.string().describe('The name of the capability to remove'),
  capabilityMode: z.enum(['Allow', 'Deny']).describe('The mode of the capability'),
  confirm: z
    .boolean()
    .optional()
    .describe(
      'When omitted or false, previews the deletion and returns a single-use token. When true, deletes the default permission (requires confirmationToken).',
    ),
  confirmationToken: z
    .string()
    .optional()
    .describe('Confirmation token from a prior preview call. Required when `confirm` is true.'),
};

export const getDeleteDefaultPermissionTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();
  const deleteDefaultPermissionTool = new WebTool({
    server,
    name: 'delete-default-permission',
    disabled: !config.adminToolsEnabled,
    description: `
**WARNING: This tool removes a default permission from a project.**

Default permissions affect NEW content created in the project. Removing them does not change permissions on existing content.

This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag.

**Two-phase (preview → confirm):**

1. **Preview (default — \`confirm\` omitted or false):** returns the deletion that would be applied plus a single-use \`confirmationToken\`. Nothing is changed.
2. **Delete (\`confirm: true\`):** deletes the default permission. Requires \`confirmationToken\` from a prior preview of the SAME parameters.

**Parameters:**
- \`projectId\` (required): The LUID of the project
- \`resourceType\` (required): workbooks, datasources, flows, metrics, lenses, dataroles, virtualconnections, databases, or tables
- \`granteeType\` (required): 'users' or 'groups'
- \`granteeId\` (required): The LUID of the user or group
- \`capabilityName\` (required): The name of the capability
- \`capabilityMode\` (required): 'Allow' or 'Deny'
- \`confirm\` (optional): Set true to delete
- \`confirmationToken\` (optional): Required when confirm is true

**Valid Capabilities by Resource Type:**
- workbooks: ${formatCapabilitiesForDisplay('workbooks')}
- datasources: ${formatCapabilitiesForDisplay('datasources')}
- flows: ${formatCapabilitiesForDisplay('flows')}
`,
    paramsSchema,
    annotations: {
      title: 'Delete Default Permission',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (args, extra): Promise<CallToolResult> => {
      return await deleteDefaultPermissionTool.logAndExecute<string>({
        extra,
        args,
        callback: async () => {
          const validationResult = validateCapability(args.resourceType, args.capabilityName);
          if (validationResult.isErr()) {
            return new UnknownError(validationResult.error.message, 400).toErr();
          }

          return await useRestApi({
            ...extra,
            jwtScopes: deleteDefaultPermissionTool.requiredApiScopes,
            callback: async (restApi) => {
              const evidence = new RegistryEvidence();
              const binding = `${args.projectId}:${args.resourceType}:${args.granteeType}:${args.granteeId}:${args.capabilityName}:${args.capabilityMode}`;

              const resolveTarget = async (): Promise<MutationTarget> => ({
                id: binding,
                kind: 'permission',
              });

              const guardResult = await guardMutation({
                restApi,
                extra,
                tool: 'delete-default-permission',
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
                  `Preview — would delete default ${args.resourceType} permission ` +
                    `${args.capabilityName}:${args.capabilityMode} from project '${args.projectId}' ` +
                    `for ${args.granteeType} '${args.granteeId}'. Nothing has been changed. ` +
                    'NEXT STEP — REQUIRED: get explicit approval from the user before deleting. ' +
                    `Then call again with confirm: true and confirmationToken: "${nonce}".`,
                );
              }

              try {
                await restApi.permissionsMethods.deleteDefaultPermission({
                  siteId: restApi.siteId,
                  projectId: args.projectId,
                  resourceType: args.resourceType,
                  granteeType: args.granteeType,
                  granteeId: args.granteeId,
                  capabilityName: args.capabilityName,
                  capabilityMode: args.capabilityMode,
                });
                recordOutcome({ ok: true });
                return new Ok(
                  `Default ${args.resourceType} permission ${args.capabilityName}:${args.capabilityMode} ` +
                    `deleted from project '${args.projectId}' for ${args.granteeType} '${args.granteeId}'.`,
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                recordOutcome({ ok: false, failureDetail: message });
                return new UnknownError(
                  `Failed to delete default permission: ${message}`,
                ).toErr();
              }
            },
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return deleteDefaultPermissionTool;
};
