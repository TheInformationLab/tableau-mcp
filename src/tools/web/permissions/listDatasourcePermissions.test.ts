import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getListDatasourcePermissionsTool } from './listDatasourcePermissions.js';

const mocks = vi.hoisted(() => ({
  mockGetDatasourcePermissions: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      permissionsMethods: {
        getDatasourcePermissions: mocks.mockGetDatasourcePermissions,
      },
      siteId: 'test-site-id',
    }),
  ),
}));

async function getToolResult(args: { datasourceId: string }): Promise<CallToolResult> {
  const tool = getListDatasourcePermissionsTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('listDatasourcePermissionsTool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should have correct name', () => {
    const tool = getListDatasourcePermissionsTool(new WebMcpServer());
    expect(tool.name).toBe('list-datasource-permissions');
  });

  it('should return datasource permissions', async () => {
    mocks.mockGetDatasourcePermissions.mockResolvedValue({ granteeCapabilities: [] });
    const result = await getToolResult({ datasourceId: 'ds1' });
    expect(result.isError).toBeFalsy();
    expect(mocks.mockGetDatasourcePermissions).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      datasourceId: 'ds1',
    });
  });
});
