import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getListDefaultPermissionsTool } from './listDefaultPermissions.js';

const mocks = vi.hoisted(() => ({
  mockGetDefaultPermissions: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      permissionsMethods: {
        getDefaultPermissions: mocks.mockGetDefaultPermissions,
      },
      siteId: 'test-site-id',
    }),
  ),
}));

async function getToolResult(args: {
  projectId: string;
  resourceType:
    | 'workbooks'
    | 'datasources'
    | 'flows'
    | 'metrics'
    | 'lenses'
    | 'dataroles'
    | 'virtualconnections'
    | 'databases'
    | 'tables';
}): Promise<CallToolResult> {
  const tool = getListDefaultPermissionsTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('listDefaultPermissionsTool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return default permissions for a given resource type', async () => {
    mocks.mockGetDefaultPermissions.mockResolvedValue({ granteeCapabilities: [] });
    const result = await getToolResult({ projectId: 'p1', resourceType: 'workbooks' });
    expect(result.isError).toBeFalsy();
    expect(mocks.mockGetDefaultPermissions).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      projectId: 'p1',
      resourceType: 'workbooks',
    });
  });
});
