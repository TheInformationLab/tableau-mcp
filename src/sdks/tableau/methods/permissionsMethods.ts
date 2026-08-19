import { Zodios } from '@zodios/core';

import { AxiosRequestConfig } from '../../../utils/axios.js';
import { permissionsApis } from '../apis/permissionsApi.js';
import { RestApiCredentials } from '../restApi.js';
import { Capability, Permissions } from '../types/permissions.js';
import AuthenticatedMethods from './authenticatedMethods.js';

type GranteeCapabilitiesInput = Array<{
  user?: { id: string };
  group?: { id: string };
  capabilities: { capability: Capability[] };
}>;

/**
 * Permissions methods of the Tableau Server REST API
 *
 * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_permissions.htm
 *
 * Notes on request body shape (see fork commit 44036360):
 *   Every add*/update* endpoint sends `permissions.granteeCapabilities` as a FLAT array,
 *   NOT a nested `granteeCapabilities.granteeCapabilities` object. The prior nested shape was
 *   silently accepted by some servers and rejected by others; the flat shape is the one Tableau's
 *   REST API documents.
 */
export default class PermissionsMethods extends AuthenticatedMethods<typeof permissionsApis> {
  constructor(baseUrl: string, creds: RestApiCredentials, axiosConfig: AxiosRequestConfig) {
    super(new Zodios(baseUrl, permissionsApis, { axiosConfig }), creds);
  }

  /**
   * Returns permissions for the specified project.
   *
   * Required scopes: `tableau:permissions:read`
   */
  getProjectPermissions = async ({
    siteId,
    projectId,
  }: {
    siteId: string;
    projectId: string;
  }): Promise<Permissions> => {
    const response = await this._apiClient.getProjectPermissions({
      params: { siteId, projectId },
      ...this.authHeader,
    });
    return response.permissions;
  };

  /**
   * Returns permissions for the specified workbook.
   *
   * Required scopes: `tableau:permissions:read`
   */
  getWorkbookPermissions = async ({
    siteId,
    workbookId,
  }: {
    siteId: string;
    workbookId: string;
  }): Promise<Permissions> => {
    const response = await this._apiClient.getWorkbookPermissions({
      params: { siteId, workbookId },
      ...this.authHeader,
    });
    return response.permissions;
  };

  /**
   * Returns permissions for the specified datasource.
   *
   * Required scopes: `tableau:permissions:read`
   */
  getDatasourcePermissions = async ({
    siteId,
    datasourceId,
  }: {
    siteId: string;
    datasourceId: string;
  }): Promise<Permissions> => {
    const response = await this._apiClient.getDatasourcePermissions({
      params: { siteId, datasourceId },
      ...this.authHeader,
    });
    return response.permissions;
  };

  /**
   * Returns permissions for the specified view.
   *
   * Required scopes: `tableau:permissions:read`
   */
  getViewPermissions = async ({
    siteId,
    viewId,
  }: {
    siteId: string;
    viewId: string;
  }): Promise<Permissions> => {
    const response = await this._apiClient.getViewPermissions({
      params: { siteId, viewId },
      ...this.authHeader,
    });
    return response.permissions;
  };

  /**
   * Returns the default permissions for a specific resource type in a project.
   *
   * Required scopes: `tableau:permissions:read`
   */
  getDefaultPermissions = async ({
    siteId,
    projectId,
    resourceType,
  }: {
    siteId: string;
    projectId: string;
    resourceType: string;
  }): Promise<Permissions> => {
    const response = await this._apiClient.getDefaultPermissions({
      params: { siteId, projectId, resourceType },
      ...this.authHeader,
    });
    return response.permissions;
  };

  /**
   * Adds permissions to the specified project.
   *
   * Required scopes: `tableau:permissions:update`
   */
  addProjectPermissions = async ({
    siteId,
    projectId,
    granteeCapabilities,
  }: {
    siteId: string;
    projectId: string;
    granteeCapabilities: GranteeCapabilitiesInput;
  }): Promise<Permissions> => {
    const response = await this._apiClient.addProjectPermissions(
      {
        permissions: {
          granteeCapabilities,
        },
      },
      { params: { siteId, projectId }, ...this.authHeader },
    );
    return response.permissions;
  };

  /**
   * Adds permissions to the specified workbook.
   *
   * Required scopes: `tableau:permissions:update`
   */
  addWorkbookPermissions = async ({
    siteId,
    workbookId,
    granteeCapabilities,
  }: {
    siteId: string;
    workbookId: string;
    granteeCapabilities: GranteeCapabilitiesInput;
  }): Promise<Permissions> => {
    const response = await this._apiClient.addWorkbookPermissions(
      {
        permissions: {
          granteeCapabilities,
        },
      },
      { params: { siteId, workbookId }, ...this.authHeader },
    );
    return response.permissions;
  };

  /**
   * Adds permissions to the specified datasource.
   *
   * Required scopes: `tableau:permissions:update`
   */
  addDatasourcePermissions = async ({
    siteId,
    datasourceId,
    granteeCapabilities,
  }: {
    siteId: string;
    datasourceId: string;
    granteeCapabilities: GranteeCapabilitiesInput;
  }): Promise<Permissions> => {
    const response = await this._apiClient.addDatasourcePermissions(
      {
        permissions: {
          granteeCapabilities,
        },
      },
      { params: { siteId, datasourceId }, ...this.authHeader },
    );
    return response.permissions;
  };

  /**
   * Adds permissions to the specified view.
   *
   * Required scopes: `tableau:permissions:update`
   */
  addViewPermissions = async ({
    siteId,
    viewId,
    granteeCapabilities,
  }: {
    siteId: string;
    viewId: string;
    granteeCapabilities: GranteeCapabilitiesInput;
  }): Promise<Permissions> => {
    const response = await this._apiClient.addViewPermissions(
      {
        permissions: {
          granteeCapabilities,
        },
      },
      { params: { siteId, viewId }, ...this.authHeader },
    );
    return response.permissions;
  };

  /**
   * Updates the default permissions for a specific resource type in a project.
   *
   * Required scopes: `tableau:permissions:update`
   */
  updateDefaultPermissions = async ({
    siteId,
    projectId,
    resourceType,
    granteeCapabilities,
  }: {
    siteId: string;
    projectId: string;
    resourceType: string;
    granteeCapabilities: GranteeCapabilitiesInput;
  }): Promise<Permissions> => {
    const response = await this._apiClient.updateDefaultPermissions(
      {
        permissions: {
          granteeCapabilities,
        },
      },
      { params: { siteId, projectId, resourceType }, ...this.authHeader },
    );
    return response.permissions;
  };

  /**
   * Deletes a specific permission from a project.
   *
   * Required scopes: `tableau:permissions:delete`
   */
  deleteProjectPermission = async ({
    siteId,
    projectId,
    granteeType,
    granteeId,
    capabilityName,
    capabilityMode,
  }: {
    siteId: string;
    projectId: string;
    granteeType: string;
    granteeId: string;
    capabilityName: string;
    capabilityMode: string;
  }): Promise<void> => {
    await this._apiClient.deleteProjectPermission(undefined, {
      params: { siteId, projectId, granteeType, granteeId, capabilityName, capabilityMode },
      ...this.authHeader,
    });
  };

  /**
   * Deletes a specific permission from a workbook.
   *
   * Required scopes: `tableau:permissions:delete`
   */
  deleteWorkbookPermission = async ({
    siteId,
    workbookId,
    granteeType,
    granteeId,
    capabilityName,
    capabilityMode,
  }: {
    siteId: string;
    workbookId: string;
    granteeType: string;
    granteeId: string;
    capabilityName: string;
    capabilityMode: string;
  }): Promise<void> => {
    await this._apiClient.deleteWorkbookPermission(undefined, {
      params: { siteId, workbookId, granteeType, granteeId, capabilityName, capabilityMode },
      ...this.authHeader,
    });
  };

  /**
   * Deletes a specific permission from a datasource.
   *
   * Required scopes: `tableau:permissions:delete`
   */
  deleteDatasourcePermission = async ({
    siteId,
    datasourceId,
    granteeType,
    granteeId,
    capabilityName,
    capabilityMode,
  }: {
    siteId: string;
    datasourceId: string;
    granteeType: string;
    granteeId: string;
    capabilityName: string;
    capabilityMode: string;
  }): Promise<void> => {
    await this._apiClient.deleteDatasourcePermission(undefined, {
      params: { siteId, datasourceId, granteeType, granteeId, capabilityName, capabilityMode },
      ...this.authHeader,
    });
  };

  /**
   * Deletes a specific permission from a view.
   *
   * Required scopes: `tableau:permissions:delete`
   */
  deleteViewPermission = async ({
    siteId,
    viewId,
    granteeType,
    granteeId,
    capabilityName,
    capabilityMode,
  }: {
    siteId: string;
    viewId: string;
    granteeType: string;
    granteeId: string;
    capabilityName: string;
    capabilityMode: string;
  }): Promise<void> => {
    await this._apiClient.deleteViewPermission(undefined, {
      params: { siteId, viewId, granteeType, granteeId, capabilityName, capabilityMode },
      ...this.authHeader,
    });
  };

  /**
   * Deletes a specific default permission from a project.
   *
   * Required scopes: `tableau:permissions:delete`
   */
  deleteDefaultPermission = async ({
    siteId,
    projectId,
    resourceType,
    granteeType,
    granteeId,
    capabilityName,
    capabilityMode,
  }: {
    siteId: string;
    projectId: string;
    resourceType: string;
    granteeType: string;
    granteeId: string;
    capabilityName: string;
    capabilityMode: string;
  }): Promise<void> => {
    await this._apiClient.deleteDefaultPermission(undefined, {
      params: {
        siteId,
        projectId,
        resourceType,
        granteeType,
        granteeId,
        capabilityName,
        capabilityMode,
      },
      ...this.authHeader,
    });
  };
}
