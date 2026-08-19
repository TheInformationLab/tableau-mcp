import { z } from 'zod';

// Domain schema for groups
const groupDomainSchema = z.object({
  name: z.string(),
});

/**
 * Group schema for Tableau REST API responses.
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm
 */
export const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: groupDomainSchema.optional(),
  minimumSiteRole: z.string().optional(),
  userCount: z.coerce.number().optional(),
  isExternalUserEnabled: z.union([z.boolean(), z.string()]).optional(),
});

export type Group = z.infer<typeof groupSchema>;
