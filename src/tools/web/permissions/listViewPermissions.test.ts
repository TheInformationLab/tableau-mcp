import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getListViewPermissionsTool } from './listViewPermissions.js';

const mocks = vi.hoisted(() => ({
  mockGetViewPermissions: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      permissionsMethods: {
        getViewPermissions: mocks.mockGetViewPermissions,
      },
      siteId: 'test-site-id',
    }),
  ),
}));

async function getToolResult(args: { viewId: string }): Promise<CallToolResult> {
  const tool = getListViewPermissionsTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('listViewPermissionsTool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should have correct name', () => {
    const tool = getListViewPermissionsTool(new WebMcpServer());
    expect(tool.name).toBe('list-view-permissions');
  });

  it('should return view permissions', async () => {
    mocks.mockGetViewPermissions.mockResolvedValue({ granteeCapabilities: [] });
    const result = await getToolResult({ viewId: 'v1' });
    expect(result.isError).toBeFalsy();
    expect(mocks.mockGetViewPermissions).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      viewId: 'v1',
    });
  });
});
