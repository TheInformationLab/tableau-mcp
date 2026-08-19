import { z } from 'zod';

/**
 * Capability schema - represents a single permission capability
 */
export const capabilitySchema = z.object({
  name: z.string(),
  mode: z.enum(['Allow', 'Deny']),
});

export type Capability = z.infer<typeof capabilitySchema>;

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
