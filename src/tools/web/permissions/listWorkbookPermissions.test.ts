import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getListWorkbookPermissionsTool } from './listWorkbookPermissions.js';

const mocks = vi.hoisted(() => ({
  mockGetWorkbookPermissions: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      permissionsMethods: {
        getWorkbookPermissions: mocks.mockGetWorkbookPermissions,
      },
      siteId: 'test-site-id',
    }),
  ),
}));

async function getToolResult(args: { workbookId: string }): Promise<CallToolResult> {
  const tool = getListWorkbookPermissionsTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('listWorkbookPermissionsTool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should have correct name and description', () => {
    const tool = getListWorkbookPermissionsTool(new WebMcpServer());
    expect(tool.name).toBe('list-workbook-permissions');
    expect(tool.description).toContain('permissions for the specified workbook');
  });

  it('should return workbook permissions', async () => {
    mocks.mockGetWorkbookPermissions.mockResolvedValue({
      granteeCapabilities: [
        {
          user: { id: 'u1' },
          capabilities: { capability: [{ name: 'Read', mode: 'Allow' as const }] },
        },
      ],
    });
    const result = await getToolResult({ workbookId: 'wb1' });
    expect(result.isError).toBeFalsy();
    expect(mocks.mockGetWorkbookPermissions).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      workbookId: 'wb1',
    });
  });
});
