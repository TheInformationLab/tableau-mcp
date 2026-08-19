import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { mockGroup } from '../groups/mockGroup.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getListGroupsForUserTool } from './listGroupsForUser.js';

const mocks = vi.hoisted(() => ({
  mockListGroupsForUser: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      usersMethods: {
        listGroupsForUser: mocks.mockListGroupsForUser,
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

describe('listGroupsForUserTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance', () => {
    const tool = getListGroupsForUserTool(new WebMcpServer());
    expect(tool.name).toBe('list-groups-for-user');
  });

  it('should return groups when the user has memberships', async () => {
    mocks.mockListGroupsForUser.mockResolvedValue({
      groups: [mockGroup],
      pagination: { pageNumber: 1, pageSize: 1000, totalAvailable: 1 },
    });
    const result = await getToolResult({ userId: 'user-abc' });
    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.data[0].id).toBe(mockGroup.id);
    expect(parsed.totalAvailable).toBe(1);
  });

  it('should return an empty message when the user has no groups', async () => {
    mocks.mockListGroupsForUser.mockResolvedValue({
      groups: [],
      pagination: { pageNumber: 1, pageSize: 1000, totalAvailable: 0 },
    });
    const result = await getToolResult({ userId: 'user-abc' });
    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('not a member of any groups');
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getListGroupsForUserTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
