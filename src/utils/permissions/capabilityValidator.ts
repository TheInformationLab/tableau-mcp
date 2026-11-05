import { Err, Ok, Result } from 'ts-results-es';

/**
 * Valid capabilities per resource type in Tableau
 */
export const validCapabilities: Record<string, readonly string[]> = {
  projects: ['ProjectLeader', 'Read', 'Write'] as const,
  workbooks: [
    'Read',
    'Write',
    'ChangePermissions',
    'Delete',
    'DownloadWorkbook',
    'ViewComments',
    'AddComment',
    'Filter',
    'ViewUnderlyingData',
    'ShareView',
    'WebAuthoring',
    'RunExplainData',
    'ExportImage',
    'ExportData',
    'ExportXml',
    'CreateRefreshMetrics',
  ] as const,
  datasources: [
    'Read',
    'Write',
    'ChangePermissions',
    'Delete',
    'Connect',
    'ExportXml',
    'SaveAs',
  ] as const,
  views: [
    'Read',
    'Filter',
    'ViewComments',
    'AddComment',
    'ViewUnderlyingData',
    'ShareView',
    'ExportImage',
    'ExportData',
    'WebAuthoring',
    'RunExplainData',
    'ExportXml',
    'ChangePermissions',
    'Delete',
  ] as const,
  flows: [
    'Read',
    'Write',
    'ChangePermissions',
    'Delete',
    'Execute',
    'WebAuthoringForFlows',
    'ExportXml',
  ] as const,
  metrics: ['Read', 'Write', 'ChangePermissions', 'Delete'] as const,
  lenses: ['Read', 'Write', 'ChangePermissions', 'Delete'] as const,
  dataroles: ['Read', 'Write', 'ChangePermissions', 'Delete'] as const,
  virtualconnections: ['Read', 'Write', 'ChangePermissions', 'Delete', 'Connect'] as const,
  databases: ['Read', 'Write', 'ChangePermissions'] as const,
  tables: ['Read', 'Write', 'ChangePermissions'] as const,
} as const;

export type CapabilityValidationError = {
  type: 'invalid-capability';
  message: string;
};

/**
 * Validates that a capability name is valid for the given resource type.
 *
 * @param resourceType - The resource type (projects, workbooks, datasources, etc.)
 * @param capabilityName - The capability name to validate
 * @returns Ok(void) if valid, Err with message if invalid
 */
export function validateCapability(
  resourceType: string,
  capabilityName: string,
): Result<void, CapabilityValidationError> {
  const capabilities = validCapabilities[resourceType];

  if (!capabilities) {
    return new Err({
      type: 'invalid-capability',
      message: `Unknown resource type: ${resourceType}. Valid types: ${Object.keys(validCapabilities).join(', ')}`,
    });
  }

  if (!capabilities.includes(capabilityName)) {
    return new Err({
      type: 'invalid-capability',
      message: `Invalid capability '${capabilityName}' for ${resourceType}. Valid capabilities: ${capabilities.join(', ')}`,
    });
  }

  return new Ok(undefined);
}

/**
 * Validates an array of capabilities for a given resource type.
 *
 * @param resourceType - The resource type (projects, workbooks, datasources, etc.)
 * @param capabilities - Array of capability objects with name and mode
 * @returns Ok(void) if all valid, Err with first invalid capability message
 */
export function validateCapabilities(
  resourceType: string,
  capabilities: Array<{ name: string; mode: string }>,
): Result<void, CapabilityValidationError> {
  for (const cap of capabilities) {
    const result = validateCapability(resourceType, cap.name);
    if (result.isErr()) {
      return result;
    }

    if (cap.mode !== 'Allow' && cap.mode !== 'Deny') {
      return new Err({
        type: 'invalid-capability',
        message: `Invalid capability mode '${cap.mode}'. Must be 'Allow' or 'Deny'.`,
      });
    }
  }

  return new Ok(undefined);
}

/**
 * Gets the list of valid capabilities for a resource type.
 *
 * @param resourceType - The resource type
 * @returns Array of valid capability names, or empty array if unknown type
 */
export function getValidCapabilities(resourceType: string): readonly string[] {
  return validCapabilities[resourceType] ?? [];
}

/**
 * Formats a list of valid capabilities for display in tool descriptions.
 *
 * @param resourceType - The resource type
 * @returns Formatted string of capabilities
 */
export function formatCapabilitiesForDisplay(resourceType: string): string {
  const caps = getValidCapabilities(resourceType);
  if (caps.length === 0) {
    return 'Unknown resource type';
  }
  return caps.join(', ');
}
