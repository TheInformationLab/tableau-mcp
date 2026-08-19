import { Zodios } from '@zodios/core';

import { AxiosRequestConfig } from '../../../utils/axios.js';
import { groupsApis } from '../apis/groupsApi.js';
import { RestApiCredentials } from '../restApi.js';
import { Group } from '../types/group.js';
import { Pagination } from '../types/pagination.js';
import { User } from '../types/user.js';
import AuthenticatedMethods from './authenticatedMethods.js';

/**
 * Groups methods of the Tableau Server REST API
 *
 * @export
 * @class GroupsMethods
 * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm
 */
export default class GroupsMethods extends AuthenticatedMethods<typeof groupsApis> {
  constructor(baseUrl: string, creds: RestApiCredentials, axiosConfig: AxiosRequestConfig) {
    super(new Zodios(baseUrl, groupsApis, { axiosConfig }), creds);
  }

  /**
   * Returns a list of groups on the specified site.
   *
   * Required scopes (Tableau Cloud): `tableau:groups:read`
   *
   * @param siteId - The Tableau site ID
   * @param filter - Filter expression
   * @param pageSize - Number of items per page (default 100, max 1000)
   * @param pageNumber - Page offset (default 1)
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#query_groups
   */
  listGroups = async ({
    siteId,
    filter,
    pageSize,
    pageNumber,
  }: {
    siteId: string;
    filter?: string;
    pageSize?: number;
    pageNumber?: number;
  }): Promise<{ groups: Group[]; pagination?: Pagination }> => {
    const response = await this._apiClient.listGroups({
      params: { siteId },
      queries: { filter, pageSize, pageNumber },
      ...this.authHeader,
    });
    return {
      groups: response.groups.group,
      pagination: response.pagination,
    };
  };

  /**
   * Creates a group on the specified site.
   *
   * Required scopes (Tableau Cloud): `tableau:groups:create`
   *
   * @param siteId - The Tableau site ID
   * @param group - Group definition
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#create_group
   */
  createGroup = async ({
    siteId,
    group,
  }: {
    siteId: string;
    group: {
      name: string;
      minimumSiteRole?: string;
    };
  }): Promise<Group> => {
    const groupData = {
      name: group.name,
      ...(group.minimumSiteRole !== undefined ? { minimumSiteRole: group.minimumSiteRole } : {}),
    };

    const { group: createdGroup } = await this._apiClient.createGroup(
      { group: groupData },
      { params: { siteId }, ...this.authHeader },
    );
    return createdGroup;
  };

  /**
   * Updates the specified group.
   *
   * Required scopes (Tableau Cloud): `tableau:groups:update`
   *
   * @param siteId - The Tableau site ID
   * @param groupId - The group ID
   * @param group - Fields to update
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#update_group
   */
  updateGroup = async ({
    siteId,
    groupId,
    group,
  }: {
    siteId: string;
    groupId: string;
    group: {
      name?: string;
      minimumSiteRole?: string;
    };
  }): Promise<Partial<Group>> => {
    const groupData = {
      ...(group.name !== undefined ? { name: group.name } : {}),
      ...(group.minimumSiteRole !== undefined ? { minimumSiteRole: group.minimumSiteRole } : {}),
    };

    const { group: updatedGroup } = await this._apiClient.updateGroup(
      { group: groupData },
      { params: { siteId, groupId }, ...this.authHeader },
    );
    return updatedGroup;
  };

  /**
   * Deletes the specified group.
   *
   * Required scopes (Tableau Cloud): `tableau:groups:delete`
   *
   * @param siteId - The Tableau site ID
   * @param groupId - The group ID
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#delete_group
   */
  deleteGroup = async ({
    siteId,
    groupId,
  }: {
    siteId: string;
    groupId: string;
  }): Promise<void> => {
    await this._apiClient.deleteGroup(undefined, {
      params: { siteId, groupId },
      ...this.authHeader,
    });
  };

  /**
   * Returns a list of users in the specified group.
   *
   * Required scopes (Tableau Cloud): `tableau:groups:read`
   *
   * @param siteId - The Tableau site ID
   * @param groupId - The group ID
   * @param pageSize - Number of items per page
   * @param pageNumber - Page offset
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#get_users_in_group
   */
  listUsersInGroup = async ({
    siteId,
    groupId,
    pageSize,
    pageNumber,
  }: {
    siteId: string;
    groupId: string;
    pageSize?: number;
    pageNumber?: number;
  }): Promise<{ users: User[]; pagination?: Pagination }> => {
    const response = await this._apiClient.listUsersInGroup({
      params: { siteId, groupId },
      queries: { pageSize, pageNumber },
      ...this.authHeader,
    });
    return {
      users: response.users.user,
      pagination: response.pagination,
    };
  };

  /**
   * Adds a user to the specified group.
   *
   * Required scopes (Tableau Cloud): `tableau:groups:update`
   *
   * @param siteId - The Tableau site ID
   * @param groupId - The group ID
   * @param userId - The user ID to add
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#add_user_to_group
   */
  addUserToGroup = async ({
    siteId,
    groupId,
    userId,
  }: {
    siteId: string;
    groupId: string;
    userId: string;
  }): Promise<User> => {
    const { user } = await this._apiClient.addUserToGroup(
      { user: { id: userId } },
      { params: { siteId, groupId }, ...this.authHeader },
    );
    return user;
  };

  /**
   * Removes a user from the specified group.
   *
   * Required scopes (Tableau Cloud): `tableau:groups:update`
   *
   * @param siteId - The Tableau site ID
   * @param groupId - The group ID
   * @param userId - The user ID to remove
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_users_and_groups.htm#remove_user_from_group
   */
  removeUserFromGroup = async ({
    siteId,
    groupId,
    userId,
  }: {
    siteId: string;
    groupId: string;
    userId: string;
  }): Promise<void> => {
    await this._apiClient.removeUserFromGroup(undefined, {
      params: { siteId, groupId, userId },
      ...this.authHeader,
    });
  };
}
