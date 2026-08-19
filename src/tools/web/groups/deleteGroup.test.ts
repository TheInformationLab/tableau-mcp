import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getDeleteGroupTool } from './deleteGroup.js';
import { mockGroup } from './mockGroup.js';

const mocks = vi.hoisted(() => ({
  mockListGroups: vi.fn(),
  mockDeleteGroup: vi.fn(),
  mockGuardMutation: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      groupsMethods: {
        listGroups: mocks.mockListGroups,
        deleteGroup: mocks.mockDeleteGroup,
      },
      siteId: 'test-site-id',
      userId: 'test-user-id',
    }),
  ),
}));

vi.mock('../../../config.js', () => ({
  getConfig: vi.fn(() => ({
    adminToolsEnabled: true,
    productTelemetryEnabled: false,
    productTelemetryEndpoint: 'https://test.com',
    server: 'https://test.tableau.com',
  })),
}));

vi.mock('../_lib/mutationGuard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/mutationGuard.js')>();
  return {
    ...actual,
    guardMutation: mocks.mockGuardMutation,
  };
});

vi.mock('../_lib/evidence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/evidence.js')>();
  return {
    ...actual,
    RegistryEvidence: vi.fn().mockImplementation(() => ({
      establish: vi.fn(),
      verify: vi.fn().mockResolvedValue(true),
      describeEvidence: () => ({ kind: 'registry-nonce' }),
      getEstablishedNonce: () => 'mock-group-nonce',
    })),
  };
});

function mockGuardSuccess(): void {
  mocks.mockGuardMutation.mockResolvedValue(
    new Ok({
      actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
      target: { id: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890', name: mockGroup.name, kind: 'group' },
      recordOutcome: vi.fn(),
    }),
  );
}

describe('deleteGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardSuccess();
    mocks.mockListGroups.mockResolvedValue({
      groups: [{ ...mockGroup, id: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890' }],
      pagination: { pageNumber: 1, pageSize: 1000, totalAvailable: 1 },
    });
  });

  it('should create a tool instance', () => {
    const tool = getDeleteGroupTool(new WebMcpServer());
    expect(tool.name).toBe('delete-group');
    expect(tool.description).toContain('WARNING');
  });

  describe('preview phase', () => {
    it('should return preview text with the nonce', async () => {
      const result = await getToolResult({
        groupId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain('Preview');
      expect(text).toContain('mock-group-nonce');
      expect(mocks.mockDeleteGroup).not.toHaveBeenCalled();
    });
  });

  describe('confirm phase', () => {
    it('should delete the group and return success', async () => {
      mocks.mockDeleteGroup.mockResolvedValue(undefined);
      const result = await getToolResult({
        groupId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
        confirm: true,
        confirmationToken: 'test-token',
      });
      expect(result.isError).toBeFalsy();
      expect(mocks.mockDeleteGroup).toHaveBeenCalledWith({
        siteId: 'test-site-id',
        groupId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
      });
    });

    it('should record outcome on REST failure', async () => {
      const recordOutcome = vi.fn();
      mocks.mockGuardMutation.mockResolvedValue(
        new Ok({
          actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
          target: { id: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890', name: 'X', kind: 'group' },
          recordOutcome,
        }),
      );
      mocks.mockDeleteGroup.mockRejectedValue(new Error('boom'));
      const result = await getToolResult({
        groupId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
        confirm: true,
        confirmationToken: 'test-token',
      });
      expect(result.isError).toBe(true);
      expect(recordOutcome).toHaveBeenCalledWith({ ok: false, failureDetail: 'boom' });
    });
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getDeleteGroupTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
