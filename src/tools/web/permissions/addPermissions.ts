import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { UnknownError } from '../../../errors/mcpToolError.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Permissions } from '../../../sdks/tableau/types/permissions.js';
import { WebMcpServer } from '../../../server.web.js';
import { formatCapabilitiesForDisplay } from '../../../utils/permissions/capabilityValidator.js';
import { validateCapabilities } from '../../../utils/permissions/capabilityValidator.js';
import { RegistryEvidence } from '../_lib/evidence.js';
import { guardMutation, MutationTarget } from '../_lib/mutationGuard.js';
import { WebTool } from '../tool.js';

const capabilityInputSchema = z.object({
  name: z.string(),
  mode: z.enum(['Allow', 'Deny']),
});

const paramsSchema = {
  resourceType: z
    .enum(['projects', 'workbooks', 'datasources', 'views'])
    .describe('The type of resource'),
  resourceId: z.string().describe('The LUID of the resource'),
  granteeType: z.enum(['user', 'group']).describe("Whether granting to a 'user' or 'group'"),
  granteeId: z.string().describe('The LUID of the user or group'),
  capabilities: z
    .array(capabilityInputSchema)
    .describe("Array of capabilities: each has 'name' + 'mode' (Allow or Deny)"),
  confirm: z
    .boolean()
    .optional()
    .describe(
      'When omitted or false, runs a non-destructive preview showing the grant that would be applied and returns a single-use confirmation token. When true, applies the grant (requires the confirmationToken from a prior preview of the SAME arguments).',
    ),
  confirmationToken: z
    .string()
    .optional()
    .describe(
      'The single-use confirmation token returned by a prior preview call. Required when `confirm` is true.',
    ),
};

export const getAddPermissionsTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const config = getConfig();
  const addPermissionsTool = new WebTool({
    server,
    name: 'add-permissions',
    disabled: !config.adminToolsEnabled,
    description: `
**Grants permissions on a Tableau resource (project, workbook, datasource, or view) to a user or group.**

This tool is restricted to Tableau site administrators and requires the \`ADMIN_TOOLS_ENABLED\` feature flag.

**Two-phase (preview → confirm):**

1. **Preview (default — \`confirm\` omitted or false):** validates the capabilities and returns the grant that would be applied, plus a single-use \`confirmationToken\`. Nothing is changed.
2. **Apply (\`confirm: true\`):** applies the grant. Requires \`confirmationToken\` from a prior preview of the SAME parameters.

**Parameters:**
- \`resourceType\` (required): projects, workbooks, datasources, or views
- \`resourceId\` (required): The LUID of the resource
- \`granteeType\` (required): 'user' or 'group'
- \`granteeId\` (required): The LUID of the user or group
- \`capabilities\` (required): Array of capabilities, each with 'name' and 'mode' (Allow/Deny)
- \`confirm\` (optional): Set true to apply
- \`confirmationToken\` (optional): Required when confirm is true

**Valid Capabilities by Resource Type:**
- projects: ${formatCapabilitiesForDisplay('projects')}
- workbooks: ${formatCapabilitiesForDisplay('workbooks')}
- datasources: ${formatCapabilitiesForDisplay('datasources')}
- views: ${formatCapabilitiesForDisplay('views')}

Tableau REST API scopes: \`tableau:permissions:update\`.
`,
    paramsSchema,
    annotations: {
      title: 'Add Permissions',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async (args, extra): Promise<CallToolResult> => {
      return await addPermissionsTool.logAndExecute<string>({
        extra,
        args,
        callback: async () => {
          // Validate capabilities up front so an obviously bad payload doesn't consume a preview
          // nonce or hit the audit log.
          const validationResult = validateCapabilities(args.resourceType, args.capabilities);
          if (validationResult.isErr()) {
            return new UnknownError(validationResult.error.message, 400).toErr();
          }

          return await useRestApi({
            ...extra,
            jwtScopes: addPermissionsTool.requiredApiScopes,
            callback: async (restApi) => {
              const evidence = new RegistryEvidence();
              const binding = buildBinding(args);

              const resolveTarget = async (): Promise<MutationTarget> => ({
                id: `${args.resourceType}/${args.resourceId}/${args.granteeType}s/${args.granteeId}`,
                kind: 'permission',
              });

              const guardResult = await guardMutation({
                restApi,
                extra,
                tool: 'add-permissions',
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
                const capsSummary = args.capabilities
                  .map((c) => `${c.name}:${c.mode}`)
                  .join(', ');
                return new Ok(
                  `Preview — would grant ${capsSummary} to ${args.granteeType} '${args.granteeId}' ` +
                    `on ${args.resourceType} '${args.resourceId}'. Nothing has been changed. ` +
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
                await applyAdd(restApi, args, granteeCapabilities);
                recordOutcome({ ok: true });
                return new Ok(
                  `Permissions granted on ${args.resourceType} '${args.resourceId}' ` +
                    `to ${args.granteeType} '${args.granteeId}'.`,
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                recordOutcome({ ok: false, failureDetail: message });
                return new UnknownError(`Failed to add permissions: ${message}`).toErr();
              }
            },
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return addPermissionsTool;
};

function buildBinding(args: {
  resourceType: string;
  resourceId: string;
  granteeType: string;
  granteeId: string;
  capabilities: Array<{ name: string; mode: string }>;
}): string {
  const capsSig = [...args.capabilities]
    .map((c) => `${c.name}:${c.mode}`)
    .sort()
    .join('|');
  return `${args.resourceType}:${args.resourceId}:${args.granteeType}:${args.granteeId}:${capsSig}`;
}

async function applyAdd(
  restApi: {
    siteId: string;
    permissionsMethods: {
      addProjectPermissions: (input: {
        siteId: string;
        projectId: string;
        granteeCapabilities: Array<{
          user?: { id: string };
          group?: { id: string };
          capabilities: { capability: Array<{ name: string; mode: 'Allow' | 'Deny' }> };
        }>;
      }) => Promise<Permissions>;
      addWorkbookPermissions: (input: {
        siteId: string;
        workbookId: string;
        granteeCapabilities: Array<{
          user?: { id: string };
          group?: { id: string };
          capabilities: { capability: Array<{ name: string; mode: 'Allow' | 'Deny' }> };
        }>;
      }) => Promise<Permissions>;
      addDatasourcePermissions: (input: {
        siteId: string;
        datasourceId: string;
        granteeCapabilities: Array<{
          user?: { id: string };
          group?: { id: string };
          capabilities: { capability: Array<{ name: string; mode: 'Allow' | 'Deny' }> };
        }>;
      }) => Promise<Permissions>;
      addViewPermissions: (input: {
        siteId: string;
        viewId: string;
        granteeCapabilities: Array<{
          user?: { id: string };
          group?: { id: string };
          capabilities: { capability: Array<{ name: string; mode: 'Allow' | 'Deny' }> };
        }>;
      }) => Promise<Permissions>;
    };
  },
  args: {
    resourceType: 'projects' | 'workbooks' | 'datasources' | 'views';
    resourceId: string;
  },
  granteeCapabilities: Array<{
    user?: { id: string };
    group?: { id: string };
    capabilities: { capability: Array<{ name: string; mode: 'Allow' | 'Deny' }> };
  }>,
): Promise<Permissions> {
  switch (args.resourceType) {
    case 'projects':
      return await restApi.permissionsMethods.addProjectPermissions({
        siteId: restApi.siteId,
        projectId: args.resourceId,
        granteeCapabilities,
      });
    case 'workbooks':
      return await restApi.permissionsMethods.addWorkbookPermissions({
        siteId: restApi.siteId,
        workbookId: args.resourceId,
        granteeCapabilities,
      });
    case 'datasources':
      return await restApi.permissionsMethods.addDatasourcePermissions({
        siteId: restApi.siteId,
        datasourceId: args.resourceId,
        granteeCapabilities,
      });
    case 'views':
      return await restApi.permissionsMethods.addViewPermissions({
        siteId: restApi.siteId,
        viewId: args.resourceId,
        granteeCapabilities,
      });
  }
}
