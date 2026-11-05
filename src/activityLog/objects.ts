import { WebToolName } from '../tools/web/toolName.js';
import { ActivityLogObject, ActivityLogObjectType, activityLogObjectTypes } from './provider.js';

type Args = Record<string, unknown>;

export type ObjectSource = {
  /** The argument names `get` reads, checked against the tool's schema in tests. */
  args: readonly string[];
  get: (args: Args) => ActivityLogObject | undefined;
};

const LUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isRecord(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectType(value: unknown): value is ActivityLogObjectType {
  return activityLogObjectTypes.some((type) => type === value);
}

// The tool acts on one object of a fixed type, whose id is in `idArg`.
function idIn(type: ActivityLogObjectType, idArg: string): ObjectSource {
  return {
    args: [idArg],
    get: (args) => (typeof args[idArg] === 'string' ? { type, luid: args[idArg] } : undefined),
  };
}

// The tool acts on one object whose type is also an argument.
function typedIdIn(typeArg: string, idArg: string): ObjectSource {
  return {
    args: [typeArg, idArg],
    get: (args) =>
      isObjectType(args[typeArg]) && typeof args[idArg] === 'string'
        ? { type: args[typeArg], luid: args[idArg] }
        : undefined,
  };
}

/**
 * The single Tableau object each tool acts against, which goes on its Activity Log event. `null`
 * means the tool has no single object (a listing, a search, or one that creates its object).
 * Typed as a `Record` so a new tool doesn't compile until it is classified here.
 */
export const activityLogObjectSources: Record<WebToolName, ObjectSource | null> = {
  'list-datasources': null,
  'list-extract-refresh-tasks': null,
  'update-cloud-extract-refresh-task': idIn('extract-refresh-task', 'taskId'),
  'confirm-update-cloud-extract-refresh-task': idIn('extract-refresh-task', 'taskId'),
  'list-jobs': null,
  'list-users': null,
  'list-workbooks': null,
  'request-workbook-upload': null,
  'publish-workbook': null,
  'request-datasource-upload': null,
  'publish-datasource': null,
  'list-projects': null,
  'list-views': null,
  'list-custom-views': idIn('workbook', 'workbookId'),
  'list-flows': null,
  'query-datasource': idIn('datasource', 'datasourceLuid'),
  'get-datasource-metadata': idIn('datasource', 'datasourceLuid'),
  'get-embed-token': null,
  'record-event': null,
  'get-workbook': idIn('workbook', 'workbookId'),
  'download-workbook': idIn('workbook', 'workbookId'),
  'move-workbook': idIn('workbook', 'workbookId'),
  'get-view': idIn('view', 'viewId'),
  'get-flow': idIn('flow', 'flowId'),
  'list-flow-runs': null,
  'list-flow-tasks': null,
  'describe-flow': idIn('flow', 'flowId'),
  'get-flow-task': idIn('flow-task', 'taskId'),
  'run-flow': idIn('flow', 'flowId'),
  'run-flow-task': idIn('flow-task', 'taskId'),
  'cancel-flow-run': idIn('flow-run', 'flowRunId'),
  'get-view-data': idIn('view', 'viewId'),
  'get-view-image': idIn('view', 'viewId'),
  'get-custom-view-data': idIn('custom-view', 'customViewId'),
  'get-custom-view-image': idIn('custom-view', 'customViewId'),
  'list-all-pulse-metric-definitions': null,
  'list-pulse-metric-definitions-from-definition-ids': null,
  'list-pulse-metrics-from-metric-definition-id': idIn(
    'pulse-metric-definition',
    'pulseMetricDefinitionID',
  ),
  'list-pulse-metrics-from-metric-ids': null,
  'list-pulse-metric-subscriptions': null,
  'generate-pulse-metric-value-insight-bundle': null,
  'generate-pulse-insight-brief': null,
  'generate-insight-cards': {
    args: ['datasource'],
    // The string form is a content URL, not a LUID.
    get: ({ datasource }) =>
      isRecord(datasource) && typeof datasource.luid === 'string'
        ? { type: 'datasource', luid: datasource.luid }
        : undefined,
  },
  'search-content': null,
  'revoke-access-token': null,
  'reset-consent': null,
  'query-admin-insights': null,
  'update-user': idIn('user', 'userId'),
  'delete-content': typedIdIn('resourceType', 'resourceId'),
  'confirm-delete-content': typedIdIn('resourceType', 'resourceId'),
  'render-interactive-viz': typedIdIn('objectType', 'luid'),
  'query-knowledge-context': null,
  'inspect-knowledge-context': null,
  'manage-knowledge-context': null,
  'scaffold-data-app': null,
  // TIL fork tools. `null` here means the Activity Log event carries no object reference, which is
  // the honest mapping for the project/group/permission tools: `activityLogObjectTypes` has no
  // 'project', 'group' or 'permission' member, and inventing vocabulary an external
  // ACTIVITY_LOG_PROVIDER does not recognize is worse than omitting the reference. The fork's own
  // audit trail for these mutations comes from `emitAuditRecord` in guardMutation, not from here.
  'get-user': idIn('user', 'userId'),
  'create-user': null,
  'delete-user': idIn('user', 'userId'),
  'list-groups-for-user': idIn('user', 'userId'),
  'list-groups': null,
  'create-group': null,
  'update-group': null,
  'delete-group': null,
  'list-users-in-group': null,
  'add-user-to-group': idIn('user', 'userId'),
  'remove-user-from-group': idIn('user', 'userId'),
  'create-project': null,
  'update-project': null,
  'delete-project': null,
  'get-extract-refresh-task': idIn('extract-refresh-task', 'taskId'),
  'create-extract-refresh-task': null,
  'run-extract-refresh-task': idIn('extract-refresh-task', 'taskId'),
  'list-project-permissions': null,
  'list-workbook-permissions': idIn('workbook', 'workbookId'),
  'list-datasource-permissions': idIn('datasource', 'datasourceId'),
  'list-view-permissions': idIn('view', 'viewId'),
  'list-default-permissions': null,
  'add-permissions': null,
  'update-default-permissions': null,
  'delete-permission': null,
  'delete-default-permission': null,
  'unpack-twbx': null,
  'read-extracted-file': null,
};

/**
 * The object a tool call acted against, or `undefined` when the tool has none or the id the client
 * passed isn't a LUID (it may be a name or URL). Never throws: it runs while a tool call finishes.
 */
export function getActivityLogObject(
  toolName: WebToolName,
  args: unknown,
): ActivityLogObject | undefined {
  try {
    const object = isRecord(args) ? activityLogObjectSources[toolName]?.get(args) : undefined;
    return object && LUID_REGEX.test(object.luid) ? object : undefined;
  } catch {
    return undefined;
  }
}
