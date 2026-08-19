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
  validateCapabilities,
} from '../../../utils/permissions/capabilityValidator.js';
import { RegistryEvidence } from '../_lib/evidence.js';
import { guardMutation, MutationTarget } from '../_lib/mutationGuard.js';
import { WebTool } from '../tool.js';

const capabilityInputSchema = z.object({
  name: z.string(),
  mode: z.enum(['Allow', 'Deny']),
});

const paramsSchema = {
  projectId: z.string().describe('The LUID of the project'),
  resourceType: defaultPermissionResourceTypeSchema.describe(
    'Resource type: workbooks, datasources, flows, metrics, lenses, dataroles, virtualconnections, databases, tables',
  ),
  granteeType: z.enum(['user', 'group']).describe("Whether granting to a 'user' or 'group'"),
  granteeId: z.string().describe('The LUID of the user or group'),
  capabilities: z
    .array(capabilityInputSchema)
    .describe("Array of capabilities: each has 'name' + 'mode' (Allow or Deny)"),
  confirm: z
    .boolean()
    .optional()
    .describe(
      'When omitted or false, previews the change and returns a single-use token. When true, applies the change (requires confirmationToken).',
    ),
  confirmationToken: z
    .string()
    .optional()
    .describe('Confirmation token from a prior preview call. Required when `confirm` is true.'),
};

export const getUpdateDefaultPermissionsTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const config = getConfig();
  const updateDefaultPermissionsTool = new WebTool({
    server,
    name: 'update-default-permissions',
    disabled: !config.adminToolsEnabled,
    description: `
**Updates the default permissions for a resource type within a project.**

Default permissions are applied to NEW content created in the project (not to existing content).

This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag.

**Two-phase (preview → confirm):**

1. **Preview (default — \`confirm\` omitted or false):** validates the capabilities and returns the change that would be applied, plus a single-use \`confirmationToken\`.
2. **Apply (\`confirm: true\`):** applies the change. Requires \`confirmationToken\` from a prior preview of the SAME parameters.

**Parameters:**
- \`projectId\` (required): The LUID of the project
- \`resourceType\` (required): workbooks, datasources, flows, metrics, lenses, dataroles, virtualconnections, databases, or tables
- \`granteeType\` (required): 'user' or 'group'
- \`granteeId\` (required): The LUID of the user or group
- \`capabilities\` (required): Array of capabilities, each with 'name' and 'mode' (Allow/Deny)
- \`confirm\` (optional): Set true to apply
- \`confirmationToken\` (optional): Required when confirm is true

**Valid Capabilities by Resource Type:**
- workbooks: ${formatCapabilitiesForDisplay('workbooks')}
- datasources: ${formatCapabilitiesForDisplay('datasources')}
- flows: ${formatCapabilitiesForDisplay('flows')}
`,
    paramsSchema,
    annotations: {
      title: 'Update Default Permissions',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (args, extra): Promise<CallToolResult> => {
      return await updateDefaultPermissionsTool.logAndExecute<string>({
        extra,
        args,
        callback: async () => {
          const validationResult = validateCapabilities(args.resourceType, args.capabilities);
          if (validationResult.isErr()) {
            return new UnknownError(validationResult.error.message, 400).toErr();
          }

          return await useRestApi({
            ...extra,
            jwtScopes: updateDefaultPermissionsTool.requiredApiScopes,
            callback: async (restApi) => {
              const evidence = new RegistryEvidence();
              const binding = buildBinding(args);

              const resolveTarget = async (): Promise<MutationTarget> => ({
                id: `projects/${args.projectId}/default-permissions/${args.resourceType}/${args.granteeType}s/${args.granteeId}`,
                kind: 'permission',
              });

              const guardResult = await guardMutation({
                restApi,
                extra,
                tool: 'update-default-permissions',
                action: 'update',
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
                const capsSummary = args.capabilities.map((c) => `${c.name}:${c.mode}`).join(', ');
                return new Ok(
                  `Preview — would set default ${args.resourceType} permissions on project ` +
                    `'${args.projectId}' for ${args.granteeType} '${args.granteeId}': ${capsSummary}. ` +
                    'Nothing has been changed. ' +
                    'NEXT STEP — REQUIRED: get explicit approval from the user before applying. ' +
                    `Then call again with confirm: true and confirmationToken: "${nonce}".`,
                );
              }

              try {
                const granteeCapabilities = [
                  {
                    ...(args.granteeType === 'user'
                      ? { user: { id: args.granteeId } }
                      : { group: { id: args.granteeId } }),
                    capabilities: { capability: args.capabilities },
                  },
                ];
                await restApi.permissionsMethods.updateDefaultPermissions({
                  siteId: restApi.siteId,
                  projectId: args.projectId,
                  resourceType: args.resourceType,
                  granteeCapabilities,
                });
                recordOutcome({ ok: true });
                return new Ok(
                  `Default ${args.resourceType} permissions updated on project '${args.projectId}' ` +
                    `for ${args.granteeType} '${args.granteeId}'.`,
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                recordOutcome({ ok: false, failureDetail: message });
                return new UnknownError(
                  `Failed to update default permissions: ${message}`,
                ).toErr();
              }
            },
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return updateDefaultPermissionsTool;
};

function buildBinding(args: {
  projectId: string;
  resourceType: string;
  granteeType: string;
  granteeId: string;
  capabilities: Array<{ name: string; mode: string }>;
}): string {
  const capsSig = [...args.capabilities]
    .map((c) => `${c.name}:${c.mode}`)
    .sort()
    .join('|');
  return `${args.projectId}:${args.resourceType}:${args.granteeType}:${args.granteeId}:${capsSig}`;
}
