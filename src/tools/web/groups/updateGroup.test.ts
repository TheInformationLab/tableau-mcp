import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { mockGroup } from './mockGroup.js';
import { getUpdateGroupTool } from './updateGroup.js';

const mocks = vi.hoisted(() => ({
  mockUpdateGroup: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      groupsMethods: {
        updateGroup: mocks.mockUpdateGroup,
      },
      siteId: 'test-site-id',
      userId: 'test-user-id',
    }),
  ),
}));

vi.mock('../adminGate.js', () => ({
  assertAdmin: mocks.mockAssertAdmin,
}));

vi.mock('../../../config.js', () => ({
  getConfig: vi.fn(() => ({
    adminToolsEnabled: true,
    productTelemetryEnabled: false,
    productTelemetryEndpoint: 'https://test.com',
    server: 'https://test.tableau.com',
  })),
}));

describe('updateGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance', () => {
    const tool = getUpdateGroupTool(new WebMcpServer());
    expect(tool.name).toBe('update-group');
  });

  it('should reject when neither name nor minimumSiteRole is provided', async () => {
    const result = await getToolResult({ groupId: 'g1' });
    expect(result.isError).toBe(true);
    expect(mocks.mockUpdateGroup).not.toHaveBeenCalled();
  });

  it('should update the group when name is provided', async () => {
    mocks.mockUpdateGroup.mockResolvedValue({ ...mockGroup, name: 'Renamed' });
    const result = await getToolResult({ groupId: 'g1', name: 'Renamed' });
    expect(result.isError).toBe(false);
    expect(mocks.mockUpdateGroup).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      groupId: 'g1',
      group: { name: 'Renamed', minimumSiteRole: undefined },
    });
  });

  it('should update minimumSiteRole', async () => {
    mocks.mockUpdateGroup.mockResolvedValue({ ...mockGroup, minimumSiteRole: 'Explorer' });
    await getToolResult({ groupId: 'g1', minimumSiteRole: 'Explorer' });
    expect(mocks.mockUpdateGroup).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      groupId: 'g1',
      group: { name: undefined, minimumSiteRole: 'Explorer' },
    });
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getUpdateGroupTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
