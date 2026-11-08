import type { ClauseRenderInput } from "./clauses";

/**
 * Renderer input for a contract document.
 *
 * Kept free of Node imports so it can be shared by the resolver (server data
 * path) and the react-pdf tree (edge runtime).
 */
export type ContractDocumentInput = ClauseRenderInput & {
  merchantId: string;
  merchantName: string;
  businessType: string;
  titleBusinessType?: string;
  displayRate: number;
  baseCommission: number | null;
  exceptions: { category: string; rate: number }[];
  vipPreContract?: boolean;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  merchantLogo?: string;
};
