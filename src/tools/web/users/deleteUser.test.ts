import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getDeleteUserTool } from './deleteUser.js';
import { mockUser } from './mockUser.js';

const mocks = vi.hoisted(() => ({
  mockQueryUserOnSite: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockGuardMutation: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      usersMethods: {
        queryUserOnSite: mocks.mockQueryUserOnSite,
        deleteUser: mocks.mockDeleteUser,
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
      getEstablishedNonce: () => 'mock-nonce-xyz',
    })),
  };
});

function mockGuardSuccess(): void {
  mocks.mockGuardMutation.mockResolvedValue(
    new Ok({
      actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
      target: { id: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890', name: 'jsmith', kind: 'user' },
      recordOutcome: vi.fn(),
    }),
  );
}

describe('deleteUserTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardSuccess();
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getDeleteUserTool(new WebMcpServer());
    expect(tool.name).toBe('delete-user');
    expect(tool.description).toContain('WARNING');
  });

  describe('preview phase', () => {
    it('should return preview text with the nonce', async () => {
      mocks.mockQueryUserOnSite.mockResolvedValue(mockUser);
      const result = await getToolResult({
        userId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain('Preview');
      expect(text).toContain('mock-nonce-xyz');
      expect(mocks.mockDeleteUser).not.toHaveBeenCalled();
    });

    it('should mention content orphaning when mapAssetsTo is omitted', async () => {
      mocks.mockQueryUserOnSite.mockResolvedValue(mockUser);
      const result = await getToolResult({
        userId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
      });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain('orphaned');
    });

    it('should mention mapAssetsTo when supplied', async () => {
      mocks.mockQueryUserOnSite.mockResolvedValue(mockUser);
      const result = await getToolResult({
        userId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
        mapAssetsTo: 'b2c3d4e5-f6a7-4890-bcde-f12345678901',
      });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain('b2c3d4e5-f6a7-4890-bcde-f12345678901');
    });
  });

  describe('confirm phase', () => {
    it('should delete the user and return success', async () => {
      mocks.mockDeleteUser.mockResolvedValue(undefined);
      const result = await getToolResult({
        userId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
        confirm: true,
        confirmationToken: 'test-token',
      });
      expect(result.isError).toBeFalsy();
      expect(mocks.mockDeleteUser).toHaveBeenCalledWith({
        siteId: 'test-site-id',
        userId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
        mapAssetsTo: undefined,
      });
    });

    it('should record the outcome on REST failure', async () => {
      const recordOutcome = vi.fn();
      mocks.mockGuardMutation.mockResolvedValue(
        new Ok({
          actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
          target: { id: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890', name: 'jsmith', kind: 'user' },
          recordOutcome,
        }),
      );
      mocks.mockDeleteUser.mockRejectedValue(new Error('boom'));

      const result = await getToolResult({
        userId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
        confirm: true,
        confirmationToken: 'test-token',
      });
      expect(result.isError).toBe(true);
      expect(recordOutcome).toHaveBeenCalledWith({ ok: false, failureDetail: 'boom' });
    });
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getDeleteUserTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
