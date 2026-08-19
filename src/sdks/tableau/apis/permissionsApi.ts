import { makeApi, makeEndpoint, ZodiosEndpointDefinitions } from '@zodios/core';
import { z } from 'zod';

import { capabilitySchema, permissionsSchema } from '../types/permissions.js';

// Fork commit 44036360: the request body must be `permissions.granteeCapabilities: [...]` (a
// FLAT array). Prior to that fix it was wrongly nested as `granteeCapabilities.granteeCapabilities`.
// Keep this shape verbatim on every add/update endpoint — do not re-introduce the nesting.
const addPermissionsBodySchema = z.object({
  permissions: z.object({
    granteeCapabilities: z.array(
      z.object({
        user: z.object({ id: z.string() }).optional(),
        group: z.object({ id: z.string() }).optional(),
        capabilities: z.object({
          capability: z.array(capabilitySchema),
        }),
      }),
    ),
  }),
});

// GET Project Permissions
const getProjectPermissionsEndpoint = makeEndpoint({
  method: 'get',
  path: '/sites/:siteId/projects/:projectId/permissions',
  alias: 'getProjectPermissions',
  description: 'Returns permissions for the specified project.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'projectId', type: 'Path', schema: z.string() },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// GET Workbook Permissions
const getWorkbookPermissionsEndpoint = makeEndpoint({
  method: 'get',
  path: '/sites/:siteId/workbooks/:workbookId/permissions',
  alias: 'getWorkbookPermissions',
  description: 'Returns permissions for the specified workbook.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'workbookId', type: 'Path', schema: z.string() },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// GET Datasource Permissions
const getDatasourcePermissionsEndpoint = makeEndpoint({
  method: 'get',
  path: '/sites/:siteId/datasources/:datasourceId/permissions',
  alias: 'getDatasourcePermissions',
  description: 'Returns permissions for the specified datasource.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'datasourceId', type: 'Path', schema: z.string() },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// GET View Permissions
const getViewPermissionsEndpoint = makeEndpoint({
  method: 'get',
  path: '/sites/:siteId/views/:viewId/permissions',
  alias: 'getViewPermissions',
  description: 'Returns permissions for the specified view.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'viewId', type: 'Path', schema: z.string() },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// GET Default Permissions for a Project
const getDefaultPermissionsEndpoint = makeEndpoint({
  method: 'get',
  path: '/sites/:siteId/projects/:projectId/default-permissions/:resourceType',
  alias: 'getDefaultPermissions',
  description: 'Returns the default permissions for a specific resource type in a project.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'projectId', type: 'Path', schema: z.string() },
    { name: 'resourceType', type: 'Path', schema: z.string() },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// ADD Permissions to a Project
const addProjectPermissionsEndpoint = makeEndpoint({
  method: 'put',
  path: '/sites/:siteId/projects/:projectId/permissions',
  alias: 'addProjectPermissions',
  description: 'Adds permissions to the specified project.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'projectId', type: 'Path', schema: z.string() },
    {
      name: 'permissions',
      type: 'Body',
      schema: addPermissionsBodySchema,
    },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// ADD Permissions to a Workbook
const addWorkbookPermissionsEndpoint = makeEndpoint({
  method: 'put',
  path: '/sites/:siteId/workbooks/:workbookId/permissions',
  alias: 'addWorkbookPermissions',
  description: 'Adds permissions to the specified workbook.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'workbookId', type: 'Path', schema: z.string() },
    {
      name: 'permissions',
      type: 'Body',
      schema: addPermissionsBodySchema,
    },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// ADD Permissions to a Datasource
const addDatasourcePermissionsEndpoint = makeEndpoint({
  method: 'put',
  path: '/sites/:siteId/datasources/:datasourceId/permissions',
  alias: 'addDatasourcePermissions',
  description: 'Adds permissions to the specified datasource.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'datasourceId', type: 'Path', schema: z.string() },
    {
      name: 'permissions',
      type: 'Body',
      schema: addPermissionsBodySchema,
    },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// ADD Permissions to a View
const addViewPermissionsEndpoint = makeEndpoint({
  method: 'put',
  path: '/sites/:siteId/views/:viewId/permissions',
  alias: 'addViewPermissions',
  description: 'Adds permissions to the specified view.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'viewId', type: 'Path', schema: z.string() },
    {
      name: 'permissions',
      type: 'Body',
      schema: addPermissionsBodySchema,
    },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// UPDATE Default Permissions
const updateDefaultPermissionsEndpoint = makeEndpoint({
  method: 'put',
  path: '/sites/:siteId/projects/:projectId/default-permissions/:resourceType',
  alias: 'updateDefaultPermissions',
  description: 'Updates the default permissions for a specific resource type in a project.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'projectId', type: 'Path', schema: z.string() },
    { name: 'resourceType', type: 'Path', schema: z.string() },
    {
      name: 'permissions',
      type: 'Body',
      schema: addPermissionsBodySchema,
    },
  ],
  response: z.object({
    permissions: permissionsSchema,
  }),
});

// DELETE Project Permission
const deleteProjectPermissionEndpoint = makeEndpoint({
  method: 'delete',
  path: '/sites/:siteId/projects/:projectId/permissions/:granteeType/:granteeId/:capabilityName/:capabilityMode',
  alias: 'deleteProjectPermission',
  description: 'Deletes a specific permission from a project.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'projectId', type: 'Path', schema: z.string() },
    { name: 'granteeType', type: 'Path', schema: z.string() },
    { name: 'granteeId', type: 'Path', schema: z.string() },
    { name: 'capabilityName', type: 'Path', schema: z.string() },
    { name: 'capabilityMode', type: 'Path', schema: z.string() },
  ],
  response: z.void(),
});

// DELETE Workbook Permission
const deleteWorkbookPermissionEndpoint = makeEndpoint({
  method: 'delete',
  path: '/sites/:siteId/workbooks/:workbookId/permissions/:granteeType/:granteeId/:capabilityName/:capabilityMode',
  alias: 'deleteWorkbookPermission',
  description: 'Deletes a specific permission from a workbook.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'workbookId', type: 'Path', schema: z.string() },
    { name: 'granteeType', type: 'Path', schema: z.string() },
    { name: 'granteeId', type: 'Path', schema: z.string() },
    { name: 'capabilityName', type: 'Path', schema: z.string() },
    { name: 'capabilityMode', type: 'Path', schema: z.string() },
  ],
  response: z.void(),
});

// DELETE Datasource Permission
const deleteDatasourcePermissionEndpoint = makeEndpoint({
  method: 'delete',
  path: '/sites/:siteId/datasources/:datasourceId/permissions/:granteeType/:granteeId/:capabilityName/:capabilityMode',
  alias: 'deleteDatasourcePermission',
  description: 'Deletes a specific permission from a datasource.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'datasourceId', type: 'Path', schema: z.string() },
    { name: 'granteeType', type: 'Path', schema: z.string() },
    { name: 'granteeId', type: 'Path', schema: z.string() },
    { name: 'capabilityName', type: 'Path', schema: z.string() },
    { name: 'capabilityMode', type: 'Path', schema: z.string() },
  ],
  response: z.void(),
});

// DELETE View Permission
const deleteViewPermissionEndpoint = makeEndpoint({
  method: 'delete',
  path: '/sites/:siteId/views/:viewId/permissions/:granteeType/:granteeId/:capabilityName/:capabilityMode',
  alias: 'deleteViewPermission',
  description: 'Deletes a specific permission from a view.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'viewId', type: 'Path', schema: z.string() },
    { name: 'granteeType', type: 'Path', schema: z.string() },
    { name: 'granteeId', type: 'Path', schema: z.string() },
    { name: 'capabilityName', type: 'Path', schema: z.string() },
    { name: 'capabilityMode', type: 'Path', schema: z.string() },
  ],
  response: z.void(),
});

// DELETE Default Permission
const deleteDefaultPermissionEndpoint = makeEndpoint({
  method: 'delete',
  path: '/sites/:siteId/projects/:projectId/default-permissions/:resourceType/:granteeType/:granteeId/:capabilityName/:capabilityMode',
  alias: 'deleteDefaultPermission',
  description: 'Deletes a specific default permission from a project.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'projectId', type: 'Path', schema: z.string() },
    { name: 'resourceType', type: 'Path', schema: z.string() },
    { name: 'granteeType', type: 'Path', schema: z.string() },
    { name: 'granteeId', type: 'Path', schema: z.string() },
    { name: 'capabilityName', type: 'Path', schema: z.string() },
    { name: 'capabilityMode', type: 'Path', schema: z.string() },
  ],
  response: z.void(),
});

const permissionsApi = makeApi([
  getProjectPermissionsEndpoint,
  getWorkbookPermissionsEndpoint,
  getDatasourcePermissionsEndpoint,
  getViewPermissionsEndpoint,
  getDefaultPermissionsEndpoint,
  addProjectPermissionsEndpoint,
  addWorkbookPermissionsEndpoint,
  addDatasourcePermissionsEndpoint,
  addViewPermissionsEndpoint,
  updateDefaultPermissionsEndpoint,
  deleteProjectPermissionEndpoint,
  deleteWorkbookPermissionEndpoint,
  deleteDatasourcePermissionEndpoint,
  deleteViewPermissionEndpoint,
  deleteDefaultPermissionEndpoint,
]);

export const permissionsApis = [...permissionsApi] as const satisfies ZodiosEndpointDefinitions;
