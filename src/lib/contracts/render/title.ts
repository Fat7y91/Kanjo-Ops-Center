import { isRestaurantCafeCategoryExact } from "./constants";
import type { ContractDocumentInput } from "./input";

/** Document title, matching the V1 heading on the issued contracts. */
export function contractDocumentTitle(input: ContractDocumentInput): string {
  const isRestCafe = isRestaurantCafeCategoryExact(input.category);
  const titleBusinessType =
    isRestCafe && input.titleBusinessType
      ? input.titleBusinessType
      : input.businessType;
  return `عقد انضمام ${titleBusinessType} ${input.merchantName}`;
}
