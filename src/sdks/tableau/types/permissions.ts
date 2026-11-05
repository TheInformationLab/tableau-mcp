import { z } from 'zod';

// Query Workbook Permissions response (rest_api_ref_permissions.htm#query_workbook_permissions).
// Fields are kept defensively optional - following workbookConnectionSchema - because Tableau
// Server/Cloud versions vary in what they emit and omit empty collections, so one odd grantee
// should not fail the whole parse. `mode` is 'Allow'/'Deny' but stays a string for forward-compat.
//
// TIL fork note: this schema is shared with the fork's permissions tools, which parse the same
// capability shape off the project/workbook/view/datasource permissions endpoints. It is exported
// (upstream keeps it module-local) so `permissionsApi.ts` can reuse it rather than redeclare a
// stricter copy that would reject the odd grantee upstream is guarding against here.
export const capabilitySchema = z.object({
  name: z.string(),
  mode: z.string(),
});

export const granteeCapabilitySchema = z.object({
  user: z.object({ id: z.string(), name: z.string().optional() }).optional(),
  group: z.object({ id: z.string(), name: z.string().optional() }).optional(),
  capabilities: z.object({ capability: z.array(capabilitySchema).optional() }).optional(),
});

export const workbookPermissionsSchema = z.object({
  permissions: z.object({
    workbook: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
    granteeCapabilities: z.array(granteeCapabilitySchema).optional(),
  }),
});

export type GranteeCapability = z.infer<typeof granteeCapabilitySchema>;
export type WorkbookPermissions = z.infer<typeof workbookPermissionsSchema>;

export type Capability = z.infer<typeof capabilitySchema>;

/**
 * Mode accepted on a permissions WRITE. Responses parse `mode` as a plain string (see the
 * forward-compat note above), but the add/update request bodies only ever send Allow or Deny,
 * so the write path keeps the narrow type. Tool input schemas validate this at the boundary
 * with their own `z.enum(['Allow', 'Deny'])`.
 */
export type CapabilityMode = 'Allow' | 'Deny';

/**
 * A single capability on a permissions write request.
 */
export type CapabilityInput = {
  name: string;
  mode: CapabilityMode;
};

/**
 * Grantee capabilities schema - permissions for a user or group
 */
export const granteeCapabilitiesSchema = z.object({
  user: z
    .object({
      id: z.string(),
    })
    .optional(),
  group: z
    .object({
      id: z.string(),
    })
    .optional(),
  capabilities: z.object({
    capability: z.array(capabilitySchema),
  }),
});

export type GranteeCapabilities = z.infer<typeof granteeCapabilitiesSchema>;

/**
 * Permissions schema - full permissions response
 * Note: granteeCapabilities can be either an array or an object with nested array
 * depending on the Tableau API response format (see fork commit 8ce552a1).
 */
export const permissionsSchema = z.object({
  parent: z
    .object({
      id: z.string(),
      type: z.string(),
    })
    .optional(),
  granteeCapabilities: z
    .union([
      z.array(granteeCapabilitiesSchema),
      z.object({
        granteeCapabilities: z.array(granteeCapabilitiesSchema).optional(),
      }),
    ])
    .optional(),
});

export type Permissions = z.infer<typeof permissionsSchema>;

/**
 * Resource types that support permissions
 */
export const permissionResourceTypeSchema = z.enum([
  'projects',
  'workbooks',
  'datasources',
  'views',
  'flows',
  'metrics',
  'lenses',
  'dataroles',
  'virtualconnections',
  'databases',
  'tables',
]);

export type PermissionResourceType = z.infer<typeof permissionResourceTypeSchema>;

/**
 * Default permission resource types (subset used for project defaults)
 */
export const defaultPermissionResourceTypeSchema = z.enum([
  'workbooks',
  'datasources',
  'flows',
  'metrics',
  'lenses',
  'dataroles',
  'virtualconnections',
  'databases',
  'tables',
]);

export type DefaultPermissionResourceType = z.infer<typeof defaultPermissionResourceTypeSchema>;

/**
 * Grantee type - user or group
 */
export const granteeTypeSchema = z.enum(['users', 'groups']);

export type GranteeType = z.infer<typeof granteeTypeSchema>;
