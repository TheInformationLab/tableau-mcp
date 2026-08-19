import { makeApi, makeEndpoint, ZodiosEndpointDefinitions } from '@zodios/core';
import { z } from 'zod';

import { groupSchema } from '../types/group.js';
import { paginationSchema } from '../types/pagination.js';
import { userSchema } from '../types/user.js';

/**
 * List Groups body schema. Normalizes different response shapes the Tableau REST
 * API may return so downstream code can rely on `groups.group` being an array.
 */
const listGroupsBodySchema = z.object({
  pagination: paginationSchema.optional(),
  groups: z.union([
    z.object({
      group: z.union([z.array(groupSchema), groupSchema.transform((group) => [group])]),
    }),
    z.array(groupSchema).transform((groups) => ({ group: groups })),
    z.object({}).transform(() => ({ group: [] })),
  ]),
});

/**
 * List Users in Group body schema. Normalizes different response shapes.
 */
const listUsersInGroupBodySchema = z.object({
  pagination: paginationSchema.optional(),
  users: z.union([
    z.object({
      user: z.union([z.array(userSchema), userSchema.transform((user) => [user])]),
    }),
    z.array(userSchema).transform((users) => ({ user: users })),
    z.object({}).transform(() => ({ user: [] })),
  ]),
});

/**
 * Query Groups
 * GET /api/api-version/sites/site-id/groups
 * Returns a list of groups on the site.
 * Tableau Cloud scope: tableau:groups:read
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#query_groups
 */
const listGroupsEndpoint = makeEndpoint({
  method: 'get',
  path: '/sites/:siteId/groups',
  alias: 'listGroups',
  description: 'Returns a list of groups on the specified site.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'pageSize', type: 'Query', schema: z.number().optional() },
    { name: 'pageNumber', type: 'Query', schema: z.number().optional() },
    {
      name: 'filter',
      type: 'Query',
      schema: z.string().optional(),
      description: 'Filter string in the format field:operator:value',
    },
  ],
  response: listGroupsBodySchema,
});

/**
 * Create Group
 * POST /api/api-version/sites/site-id/groups
 * Creates a group on the specified site.
 * Tableau Cloud scope: tableau:groups:create
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#create_group
 */
const createGroupEndpoint = makeEndpoint({
  method: 'post',
  path: '/sites/:siteId/groups',
  alias: 'createGroup',
  description: 'Creates a group on the specified site.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    {
      name: 'body',
      type: 'Body',
      schema: z.object({
        group: z.object({
          name: z.string(),
          minimumSiteRole: z.string().optional(),
        }),
      }),
    },
  ],
  response: z.object({ group: groupSchema }),
});

/**
 * Update Group
 * PUT /api/api-version/sites/site-id/groups/group-id
 * Updates the specified group.
 * Tableau Cloud scope: tableau:groups:update
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#update_group
 */
const updateGroupEndpoint = makeEndpoint({
  method: 'put',
  path: '/sites/:siteId/groups/:groupId',
  alias: 'updateGroup',
  description: 'Updates the specified group.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'groupId', type: 'Path', schema: z.string() },
    {
      name: 'body',
      type: 'Body',
      schema: z.object({
        group: z.object({
          name: z.string().optional(),
          minimumSiteRole: z.string().optional(),
        }),
      }),
    },
  ],
  response: z.object({ group: groupSchema.partial() }),
});

/**
 * Delete Group
 * DELETE /api/api-version/sites/site-id/groups/group-id
 * Deletes the specified group.
 * Tableau Cloud scope: tableau:groups:delete
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#delete_group
 */
const deleteGroupEndpoint = makeEndpoint({
  method: 'delete',
  path: '/sites/:siteId/groups/:groupId',
  alias: 'deleteGroup',
  description: 'Deletes the specified group.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'groupId', type: 'Path', schema: z.string() },
  ],
  response: z.void(),
});

/**
 * Get Users in Group
 * GET /api/api-version/sites/site-id/groups/group-id/users
 * Returns a list of users in the specified group.
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#get_users_in_group
 */
const listUsersInGroupEndpoint = makeEndpoint({
  method: 'get',
  path: '/sites/:siteId/groups/:groupId/users',
  alias: 'listUsersInGroup',
  description: 'Returns a list of users in the specified group.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'groupId', type: 'Path', schema: z.string() },
    { name: 'pageSize', type: 'Query', schema: z.number().optional() },
    { name: 'pageNumber', type: 'Query', schema: z.number().optional() },
  ],
  response: listUsersInGroupBodySchema,
});

/**
 * Add User to Group
 * POST /api/api-version/sites/site-id/groups/group-id/users
 * Adds a user to the specified group.
 * Tableau Cloud scope: tableau:groups:update
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#add_user_to_group
 */
const addUserToGroupEndpoint = makeEndpoint({
  method: 'post',
  path: '/sites/:siteId/groups/:groupId/users',
  alias: 'addUserToGroup',
  description: 'Adds a user to the specified group.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'groupId', type: 'Path', schema: z.string() },
    {
      name: 'body',
      type: 'Body',
      schema: z.object({
        user: z.object({
          id: z.string(),
        }),
      }),
    },
  ],
  response: z.object({ user: userSchema }),
});

/**
 * Remove User from Group
 * DELETE /api/api-version/sites/site-id/groups/group-id/users/user-id
 * Removes a user from the specified group.
 * Tableau Cloud scope: tableau:groups:update
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#remove_user_from_group
 */
const removeUserFromGroupEndpoint = makeEndpoint({
  method: 'delete',
  path: '/sites/:siteId/groups/:groupId/users/:userId',
  alias: 'removeUserFromGroup',
  description: 'Removes a user from the specified group.',
  parameters: [
    { name: 'siteId', type: 'Path', schema: z.string() },
    { name: 'groupId', type: 'Path', schema: z.string() },
    { name: 'userId', type: 'Path', schema: z.string() },
  ],
  response: z.void(),
});

const groupsApi = makeApi([
  listGroupsEndpoint,
  createGroupEndpoint,
  updateGroupEndpoint,
  deleteGroupEndpoint,
  listUsersInGroupEndpoint,
  addUserToGroupEndpoint,
  removeUserFromGroupEndpoint,
]);

export const groupsApis = [...groupsApi] as const satisfies ZodiosEndpointDefinitions;
