import { makeApi, makeEndpoint, ZodiosEndpointDefinitions } from '@zodios/core';
import { z } from 'zod';

import { paginationSchema } from '../types/pagination.js';
import { contentPermissionsSchema, projectSchema } from '../types/project.js';
import { paginationParameters } from './paginationParameters.js';

const queryProjectsEndpoint = makeEndpoint({
  method: 'get',
  path: '/sites/:siteId/projects',
  alias: 'queryProjects',
  description: 'Returns a list of projects on the specified site.',
  parameters: [
    ...paginationParameters,
    {
      name: 'siteId',
      type: 'Path',
      schema: z.string(),
    },
    {
      name: 'filter',
      type: 'Query',
      schema: z.string().optional(),
      description:
        'An expression that lets you specify a subset of projects to return. You can filter on predefined fields such as name, ownerName, parentProjectId, and updatedAt. You can include multiple filter expressions.',
    },
  ],
  response: z.object({
    pagination: paginationSchema,
    projects: z.object({
      project: z.optional(z.array(projectSchema)),
    }),
  }),
});

const createProjectEndpoint = makeEndpoint({
  method: 'post',
  path: '/sites/:siteId/projects',
  alias: 'createProject',
  description: 'Creates a new project on the specified site.',
  parameters: [
    {
      name: 'siteId',
      type: 'Path',
      schema: z.string(),
    },
    {
      name: 'body',
      type: 'Body',
      schema: z.object({
        project: z.object({
          name: z.string(),
          description: z.string().optional(),
          contentPermissions: contentPermissionsSchema.optional(),
          parentProjectId: z.string().optional(),
        }),
      }),
    },
  ],
  response: z.object({
    project: projectSchema,
  }),
});

const updateProjectEndpoint = makeEndpoint({
  method: 'put',
  path: '/sites/:siteId/projects/:projectId',
  alias: 'updateProject',
  description: 'Updates the specified project.',
  parameters: [
    {
      name: 'siteId',
      type: 'Path',
      schema: z.string(),
    },
    {
      name: 'projectId',
      type: 'Path',
      schema: z.string(),
    },
    {
      name: 'body',
      type: 'Body',
      schema: z.object({
        project: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          contentPermissions: contentPermissionsSchema.optional(),
          parentProjectId: z.string().optional(),
          ownerId: z.string().optional(),
        }),
      }),
    },
  ],
  response: z.object({
    project: projectSchema,
  }),
});

const deleteProjectEndpoint = makeEndpoint({
  method: 'delete',
  path: '/sites/:siteId/projects/:projectId',
  alias: 'deleteProject',
  description: 'Deletes the specified project.',
  parameters: [
    {
      name: 'siteId',
      type: 'Path',
      schema: z.string(),
    },
    {
      name: 'projectId',
      type: 'Path',
      schema: z.string(),
    },
  ],
  response: z.void(),
});

const projectsApi = makeApi([
  queryProjectsEndpoint,
  createProjectEndpoint,
  updateProjectEndpoint,
  deleteProjectEndpoint,
]);

export const projectsApis = [...projectsApi] as const satisfies ZodiosEndpointDefinitions;
