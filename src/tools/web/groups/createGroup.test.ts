import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getCreateGroupTool } from './createGroup.js';
import { mockGroup } from './mockGroup.js';

const mocks = vi.hoisted(() => ({
  mockCreateGroup: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      groupsMethods: {
        createGroup: mocks.mockCreateGroup,
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

describe('createGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance', () => {
    const tool = getCreateGroupTool(new WebMcpServer());
    expect(tool.name).toBe('create-group');
  });

  it('should create the group and return the record', async () => {
    mocks.mockCreateGroup.mockResolvedValue(mockGroup);
    const result = await getToolResult({ name: 'Marketing' });
    expect(result.isError).toBe(false);
    expect(mocks.mockCreateGroup).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      group: { name: 'Marketing', minimumSiteRole: undefined },
    });
  });

  it('should pass minimumSiteRole when provided', async () => {
    mocks.mockCreateGroup.mockResolvedValue(mockGroup);
    await getToolResult({ name: 'Analysts', minimumSiteRole: 'Creator' });
    expect(mocks.mockCreateGroup).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      group: { name: 'Analysts', minimumSiteRole: 'Creator' },
    });
  });

  it('should reject non-admin caller', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('nope'));
    const result = await getToolResult({ name: 'X' });
    expect(result.isError).toBe(true);
    expect(mocks.mockCreateGroup).not.toHaveBeenCalled();
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getCreateGroupTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
