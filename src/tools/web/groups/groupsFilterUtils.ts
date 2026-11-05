import { z } from 'zod';

import {
  FilterOperator,
  FilterOperatorSchema,
  parseAndValidateFilterString,
} from '../../../utils/parseAndValidateFilterString.js';

// === Field and Operator Definitions ===
// [Tableau REST API Groups filter fields](https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_concepts_filtering_and_sorting.htm#groups)

const FilterFieldSchema = z.enum(['name', 'domainName', 'minimumSiteRole', 'isLocal']);

type FilterField = z.infer<typeof FilterFieldSchema>;

// 'has' is deliberately absent: `FilterOperatorSchema` (the shared parser) only accepts
// eq/in/gt/gte/lt/lte and rejects anything else before this allowlist is consulted, so listing
// 'has' here was unreachable config rather than a working capability.
const allowedOperatorsByField: Record<FilterField, FilterOperator[]> = {
  name: ['eq', 'in'],
  domainName: ['eq', 'in'],
  minimumSiteRole: ['eq', 'in'],
  isLocal: ['eq'],
};

const _FilterExpressionSchema = z.object({
  field: FilterFieldSchema,
  operator: FilterOperatorSchema,
  value: z.string(),
});

type FilterExpression = z.infer<typeof _FilterExpressionSchema>;

export function parseAndValidateGroupsFilterString(filterString: string): string {
  return parseAndValidateFilterString<FilterField, FilterExpression>({
    filterString,
    allowedOperatorsByField,
    filterFieldSchema: FilterFieldSchema,
  });
}

export const exportedForTesting = {
  FilterFieldSchema,
};
