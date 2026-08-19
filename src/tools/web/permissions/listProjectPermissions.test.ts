import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getListProjectPermissionsTool } from './listProjectPermissions.js';

const mocks = vi.hoisted(() => ({
  mockGetProjectPermissions: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      permissionsMethods: {
        getProjectPermissions: mocks.mockGetProjectPermissions,
      },
      siteId: 'test-site-id',
    }),
  ),
}));

async function getToolResult(args: { projectId: string }): Promise<CallToolResult> {
  const tool = getListProjectPermissionsTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('listProjectPermissionsTool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should create a tool instance with correct properties', () => {
    const tool = getListProjectPermissionsTool(new WebMcpServer());
    expect(tool.name).toBe('list-project-permissions');
    expect(tool.description).toContain('permissions for the specified project');
  });

  it('should return permissions successfully (flat array shape)', async () => {
    const mockPermissions = {
      parent: { id: 'p1', type: 'Project' },
      granteeCapabilities: [
        {
          user: { id: 'u1' },
          capabilities: { capability: [{ name: 'Read', mode: 'Allow' as const }] },
        },
      ],
    };
    mocks.mockGetProjectPermissions.mockResolvedValue(mockPermissions);

    const result = await getToolResult({ projectId: 'p1' });
    expect(result.isError).toBeFalsy();
    expect(mocks.mockGetProjectPermissions).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      projectId: 'p1',
    });
  });

  it('should accept nested granteeCapabilities object shape (fork commit 8ce552a1 tolerance)', async () => {
    const mockPermissions = {
      granteeCapabilities: {
        granteeCapabilities: [
          {
            group: { id: 'g1' },
            capabilities: { capability: [{ name: 'Write', mode: 'Allow' as const }] },
          },
        ],
      },
    };
    mocks.mockGetProjectPermissions.mockResolvedValue(mockPermissions);

    const result = await getToolResult({ projectId: 'p2' });
    expect(result.isError).toBeFalsy();
  });
});
