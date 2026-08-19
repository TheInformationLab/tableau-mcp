import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { mockUser } from '../users/mockUser.js';
import { getListUsersInGroupTool } from './listUsersInGroup.js';

const mocks = vi.hoisted(() => ({
  mockListUsersInGroup: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      groupsMethods: {
        listUsersInGroup: mocks.mockListUsersInGroup,
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

describe('listUsersInGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance', () => {
    const tool = getListUsersInGroupTool(new WebMcpServer());
    expect(tool.name).toBe('list-users-in-group');
  });

  it('should return users when the group has members', async () => {
    mocks.mockListUsersInGroup.mockResolvedValue({
      users: [mockUser],
      pagination: { pageNumber: 1, pageSize: 1000, totalAvailable: 1 },
    });
    const result = await getToolResult({ groupId: 'g1' });
    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.data[0].id).toBe(mockUser.id);
  });

  it('should return an empty message when the group has no members', async () => {
    mocks.mockListUsersInGroup.mockResolvedValue({
      users: [],
      pagination: { pageNumber: 1, pageSize: 1000, totalAvailable: 0 },
    });
    const result = await getToolResult({ groupId: 'g1' });
    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('no members');
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getListUsersInGroupTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
