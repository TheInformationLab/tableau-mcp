import { getConfirmDeleteContentTool } from './_lib/confirmDeleteContent.js';
import { getDeleteContentTool } from './_lib/deleteContent.js';
import { getQueryAdminInsightsTool } from './adminInsights/queryAdminInsights.js';
import { getSearchContentTool } from './contentExploration/searchContent.js';
import { getListDatasourcesTool } from './datasources/listDatasources.js';
import { getConfirmUpdateCloudExtractRefreshTaskTool } from './extractRefreshTasks/confirmUpdateCloudExtractRefreshTask.js';
import { getCreateExtractRefreshTaskTool } from './extractRefreshTasks/createExtractRefreshTask.js';
import { getGetExtractRefreshTaskTool } from './extractRefreshTasks/getExtractRefreshTask.js';
import { getListExtractRefreshTasksTool } from './extractRefreshTasks/listExtractRefreshTasks.js';
import { getRunExtractRefreshTaskTool } from './extractRefreshTasks/runExtractRefreshTask.js';
import { getUpdateCloudExtractRefreshTaskTool } from './extractRefreshTasks/updateCloudExtractRefreshTask.js';
import { getGetFlowTool } from './flows/getFlow/getFlow.js';
import { getListFlowRunsTool } from './flows/listFlowRuns/listFlowRuns.js';
import { getListFlowsTool } from './flows/listFlows/listFlows.js';
import { getListFlowTasksTool } from './flows/listFlowTasks/listFlowTasks.js';
import { getGetDatasourceMetadataTool } from './getDatasourceMetadata/getDatasourceMetadata.js';
import { getEmbedTokenTool } from './getEmbedToken/getEmbedToken.js';
import { getAddUserToGroupTool } from './groups/addUserToGroup.js';
import { getCreateGroupTool } from './groups/createGroup.js';
import { getDeleteGroupTool } from './groups/deleteGroup.js';
import { getListGroupsTool } from './groups/listGroups.js';
import { getListUsersInGroupTool } from './groups/listUsersInGroup.js';
import { getRemoveUserFromGroupTool } from './groups/removeUserFromGroup.js';
import { getUpdateGroupTool } from './groups/updateGroup.js';
import { getListJobsTool } from './jobs/listJobs.js';
import { getAddPermissionsTool } from './permissions/addPermissions.js';
import { getDeleteDefaultPermissionTool } from './permissions/deleteDefaultPermission.js';
import { getDeletePermissionTool } from './permissions/deletePermission.js';
import { getListDatasourcePermissionsTool } from './permissions/listDatasourcePermissions.js';
import { getListDefaultPermissionsTool } from './permissions/listDefaultPermissions.js';
import { getListProjectPermissionsTool } from './permissions/listProjectPermissions.js';
import { getListViewPermissionsTool } from './permissions/listViewPermissions.js';
import { getListWorkbookPermissionsTool } from './permissions/listWorkbookPermissions.js';
import { getUpdateDefaultPermissionsTool } from './permissions/updateDefaultPermissions.js';
import { getCreateProjectTool } from './projects/createProject.js';
import { getDeleteProjectTool } from './projects/deleteProject.js';
import { getListProjectsTool } from './projects/listProjects.js';
import { getUpdateProjectTool } from './projects/updateProject.js';
import { getGeneratePulseInsightBriefTool } from './pulse/generateInsightBrief/generatePulseInsightBriefTool.js';
import { getGeneratePulseMetricValueInsightBundleTool } from './pulse/generateMetricValueInsightBundle/generatePulseMetricValueInsightBundleTool.js';
import { getGenerateInsightCardsTool } from './pulse/insights/generateInsightCardsTool.js';
import { getListAllPulseMetricDefinitionsTool } from './pulse/listAllMetricDefinitions/listAllPulseMetricDefinitions.js';
import { getListPulseMetricDefinitionsFromDefinitionIdsTool } from './pulse/listMetricDefinitionsFromDefinitionIds/listPulseMetricDefinitionsFromDefinitionIds.js';
import { getListPulseMetricsFromMetricDefinitionIdTool } from './pulse/listMetricsFromMetricDefinitionId/listPulseMetricsFromMetricDefinitionId.js';
import { getListPulseMetricsFromMetricIdsTool } from './pulse/listMetricsFromMetricIds/listPulseMetricsFromMetricIds.js';
import { getListPulseMetricSubscriptionsTool } from './pulse/listMetricSubscriptions/listPulseMetricSubscriptions.js';
import { getQueryDatasourceTool } from './queryDatasource/queryDatasource.js';
import { getRecordEventTool } from './recordEvent/recordEvent.js';
import { getRenderInteractiveVizTool } from './renderInteractiveViz/renderInteractiveViz.js';
import { getResetConsentTool } from './resetConsent/resetConsent.js';
import { getRevokeAccessTokenTool } from './revokeAccessToken/revokeAccessToken.js';
import { getCreateUserTool } from './users/createUser.js';
import { getDeleteUserTool } from './users/deleteUser.js';
import { getGetUserTool } from './users/getUser.js';
import { getListGroupsForUserTool } from './users/listGroupsForUser.js';
import { getListUsersTool } from './users/listUsers.js';
import { getUpdateUserTool } from './users/updateUser.js';
import { getGetCustomViewDataTool } from './views/getCustomViewData.js';
import { getGetCustomViewImageTool } from './views/getCustomViewImage.js';
import { getGetViewTool } from './views/getView.js';
import { getGetViewDataTool } from './views/getViewData.js';
import { getGetViewImageTool } from './views/getViewImage.js';
import { getListCustomViewsTool } from './views/listCustomViews.js';
import { getListViewsTool } from './views/listViews.js';
import { getDownloadWorkbookTool } from './workbooks/downloadWorkbook.js';
import { getGetWorkbookTool } from './workbooks/getWorkbook.js';
import { getListWorkbooksTool } from './workbooks/listWorkbooks.js';
import { getReadExtractedFileTool } from './workbooks/readExtractedFile.js';
import { getRequestWorkbookUploadTool } from './workbooks/requestWorkbookUpload.js';
import { getUnpackTwbxTool } from './workbooks/unpackTwbx.js';
import { getValidateUploadAndPublishWorkbookTool } from './workbooks/validateUploadAndPublishWorkbook.js';

export const webToolFactories = [
  getGetDatasourceMetadataTool,
  getEmbedTokenTool,
  getRecordEventTool,
  getRenderInteractiveVizTool,
  getListDatasourcesTool,
  getListExtractRefreshTasksTool,
  getUpdateCloudExtractRefreshTaskTool,
  getConfirmUpdateCloudExtractRefreshTaskTool,
  getGetExtractRefreshTaskTool,
  getCreateExtractRefreshTaskTool,
  getRunExtractRefreshTaskTool,
  getListJobsTool,
  getListUsersTool,
  getUpdateUserTool,
  getQueryDatasourceTool,
  getListFlowsTool,
  getGetFlowTool,
  getListFlowRunsTool,
  getListFlowTasksTool,
  getListAllPulseMetricDefinitionsTool,
  getListPulseMetricDefinitionsFromDefinitionIdsTool,
  getListPulseMetricsFromMetricDefinitionIdTool,
  getListPulseMetricsFromMetricIdsTool,
  getListPulseMetricSubscriptionsTool,
  getGeneratePulseMetricValueInsightBundleTool,
  getGeneratePulseInsightBriefTool,
  getGenerateInsightCardsTool,
  getDownloadWorkbookTool,
  getGetWorkbookTool,
  getRequestWorkbookUploadTool,
  getValidateUploadAndPublishWorkbookTool,
  getGetViewTool,
  getGetViewDataTool,
  getGetViewImageTool,
  getListWorkbooksTool,
  getListProjectsTool,
  getCreateProjectTool,
  getUpdateProjectTool,
  getDeleteProjectTool,
  getListViewsTool,
  getListCustomViewsTool,
  getGetCustomViewDataTool,
  getGetCustomViewImageTool,
  getSearchContentTool,
  getRevokeAccessTokenTool,
  getResetConsentTool,
  getQueryAdminInsightsTool,
  getDeleteContentTool,
  getConfirmDeleteContentTool,
  // Users + Groups (TIL port)
  getGetUserTool,
  getCreateUserTool,
  getDeleteUserTool,
  getListGroupsForUserTool,
  getListGroupsTool,
  getCreateGroupTool,
  getUpdateGroupTool,
  getDeleteGroupTool,
  getListUsersInGroupTool,
  getAddUserToGroupTool,
  getRemoveUserFromGroupTool,
  // Permissions (TIL port)
  getListProjectPermissionsTool,
  getListWorkbookPermissionsTool,
  getListDatasourcePermissionsTool,
  getListViewPermissionsTool,
  getListDefaultPermissionsTool,
  getAddPermissionsTool,
  getUpdateDefaultPermissionsTool,
  getDeletePermissionTool,
  getDeleteDefaultPermissionTool,
  // Workbook custom (TIL port)
  getUnpackTwbxTool,
  getReadExtractedFileTool,
];
