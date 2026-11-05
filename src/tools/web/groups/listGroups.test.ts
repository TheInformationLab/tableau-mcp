import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getListGroupsTool } from './listGroups.js';
import { mockGroup } from './mockGroup.js';

const mocks = vi.hoisted(() => ({
  mockListGroups: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      groupsMethods: {
        listGroups: mocks.mockListGroups,
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

describe('listGroupsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance', () => {
    const tool = getListGroupsTool(new WebMcpServer());
    expect(tool.name).toBe('list-groups');
    expect(tool.description).toContain('Retrieves a list of groups');
  });

  it('should return groups on success', async () => {
    mocks.mockListGroups.mockResolvedValue({
      groups: [mockGroup],
      pagination: { pageNumber: 1, pageSize: 1000, totalAvailable: 1 },
    });
    const result = await getToolResult({});
    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.data[0].id).toBe(mockGroup.id);
    expect(parsed.totalAvailable).toBe(1);
  });

  it('should return empty message when no groups exist', async () => {
    mocks.mockListGroups.mockResolvedValue({
      groups: [],
      pagination: { pageNumber: 1, pageSize: 100, totalAvailable: 0 },
    });
    const result = await getToolResult({});
    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('No groups were found');
  });

  it('should validate filter strings', async () => {
    const result = await getToolResult({ filter: 'invalidField:eq:foo' });
    expect(result.isError).toBe(true);
  });

  it('should pass the validated filter to the SDK', async () => {
    mocks.mockListGroups.mockResolvedValue({
      groups: [mockGroup],
      pagination: { pageNumber: 1, pageSize: 1000, totalAvailable: 1 },
    });
    await getToolResult({ filter: 'name:eq:Marketing' });
    expect(mocks.mockListGroups).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'name:eq:Marketing' }),
    );
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getListGroupsTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
