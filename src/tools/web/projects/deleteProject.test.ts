import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getDeleteProjectTool } from './deleteProject.js';
import { mockProject } from './mockProject.js';

const mocks = vi.hoisted(() => ({
  mockDeleteProject: vi.fn(),
  mockQueryProjects: vi.fn(),
  mockIsProjectAllowed: vi.fn(),
  mockGuardMutation: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      projectsMethods: {
        deleteProject: mocks.mockDeleteProject,
        queryProjects: mocks.mockQueryProjects,
      },
      siteId: 'test-site-id',
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

vi.mock('../resourceAccessChecker.js', () => ({
  resourceAccessChecker: {
    isProjectAllowed: (...args: unknown[]) => mocks.mockIsProjectAllowed(...args),
  },
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
      getEstablishedNonce: () => 'mock-nonce-123',
    })),
  };
});

function mockGuardSuccess(): void {
  mocks.mockGuardMutation.mockResolvedValue(
    new Ok({
      actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
      target: { id: 'proj-1', name: mockProject.name, kind: 'project' },
      recordOutcome: vi.fn(),
    }),
  );
}

describe('deleteProjectTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsProjectAllowed.mockResolvedValue({ allowed: true });
    mockGuardSuccess();
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getDeleteProjectTool(new WebMcpServer());
    expect(tool.name).toBe('delete-project');
    expect(tool.description).toContain('destructive operation');
  });

  describe('preview phase', () => {
    it('returns preview text with the nonce and skips deleteProject', async () => {
      const result = await getToolResult({ projectId: 'proj-1' });
      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain('Preview');
      expect(text).toContain('proj-1');
      expect(text).toContain('mock-nonce-123');
      expect(mocks.mockDeleteProject).not.toHaveBeenCalled();
    });

    it('calls guardMutation with preview phase', async () => {
      await getToolResult({ projectId: 'proj-1' });
      expect(mocks.mockGuardMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'delete-project',
          action: 'delete',
          mode: 'preview-confirm',
          phase: 'preview',
        }),
      );
    });
  });

  describe('confirm phase', () => {
    it('calls deleteProject and records success', async () => {
      const recordOutcome = vi.fn();
      mocks.mockGuardMutation.mockResolvedValue(
        new Ok({
          actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
          target: { id: 'proj-1', name: mockProject.name, kind: 'project' },
          recordOutcome,
        }),
      );
      mocks.mockDeleteProject.mockResolvedValue(undefined);

      const result = await getToolResult({
        projectId: 'proj-1',
        confirm: true,
        confirmationToken: 't',
      });

      expect(result.isError).toBeFalsy();
      expect(mocks.mockDeleteProject).toHaveBeenCalledWith({
        siteId: 'test-site-id',
        projectId: 'proj-1',
      });
      expect(recordOutcome).toHaveBeenCalledWith({ ok: true });
    });

    it('records failure and returns error when REST call throws', async () => {
      const recordOutcome = vi.fn();
      mocks.mockGuardMutation.mockResolvedValue(
        new Ok({
          actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
          target: { id: 'proj-1', name: mockProject.name, kind: 'project' },
          recordOutcome,
        }),
      );
      mocks.mockDeleteProject.mockRejectedValue(new Error('boom'));

      const result = await getToolResult({
        projectId: 'proj-1',
        confirm: true,
        confirmationToken: 't',
      });

      expect(result.isError).toBe(true);
      expect(recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, failureDetail: 'boom' }),
      );
    });
  });

  it('rejects when bounded-context blocks the project', async () => {
    mocks.mockIsProjectAllowed.mockResolvedValue({
      allowed: false,
      message: 'blocked',
    });

    const result = await getToolResult({ projectId: 'proj-1' });
    expect(result.isError).toBe(true);
    expect(mocks.mockGuardMutation).not.toHaveBeenCalled();
    expect(mocks.mockDeleteProject).not.toHaveBeenCalled();
  });
});

async function getToolResult(args: {
  projectId: string;
  confirm?: boolean;
  confirmationToken?: string;
}): Promise<CallToolResult> {
  const tool = getDeleteProjectTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
