import {
  ARABIC_CLAUSE_NUMBERS,
  FOOD_PREP_KEYWORDS,
  isMedicalCategory,
  isRestaurantCafeCategoryExact,
} from "./constants";
import {
  BASE_CONTRACT_CLAUSES,
  CLOSING_CONTRACT_CLAUSES,
  COMMISSION_CLAUSE_TITLE,
  FINAL_CLAUSE_TITLE,
  FINANCIAL_MECHANISM_TITLE,
  FOOD_CLAUSE,
  MEDICAL_CLAUSE,
  commissionClauseBody,
  finalClauseBody,
  financialMechanismClauseBody,
  type ContractClauseTemplate,
} from "./data/clauses";
import { toArabicNumerals } from "./format";

export type ClauseRenderInput = {
  category: string;
  achievedPercent: number;
  financialSpecialException: string;
  jurisdictionClause: string;
};

/**
 * Assembles the ordered clause list exactly like V1: fixed base, optional food
 * and medical clauses, the dynamic commission clause, closing clauses, the
 * financial-mechanism note, and the final jurisdiction clause. The commission
 * clause is inserted after the general obligations so the fixed order matches
 * the issued contracts.
 */
export function buildClauses(input: ClauseRenderInput): ContractClauseTemplate[] {
  const catSource = String(input.category ?? "");
  const foodApplies = FOOD_PREP_KEYWORDS.some((keyword) =>
    catSource.includes(keyword),
  );

  const clauses: ContractClauseTemplate[] = [...BASE_CONTRACT_CLAUSES];

  // Commission clause sits after the base obligations (index 4 in V1 order).
  clauses.splice(4, 0, {
    title: COMMISSION_CLAUSE_TITLE,
    body: commissionClauseBody(toArabicNumerals(input.achievedPercent)),
  });

  if (foodApplies) clauses.push(FOOD_CLAUSE);
  if (isMedicalCategory(input.category)) clauses.push(MEDICAL_CLAUSE);

  clauses.push(...CLOSING_CONTRACT_CLAUSES);

  const financialIndex = clauses.findIndex(
    (clause) => clause.title === "إنهاء التعاقد",
  );
  const financialClause: ContractClauseTemplate = {
    title: FINANCIAL_MECHANISM_TITLE,
    body: financialMechanismClauseBody(input.financialSpecialException),
  };
  if (financialIndex >= 0) {
    clauses.splice(financialIndex, 0, financialClause);
  } else {
    clauses.push(financialClause);
  }

  clauses.push({
    title: FINAL_CLAUSE_TITLE,
    body: finalClauseBody(input.jurisdictionClause),
  });

  return clauses;
}

export function clauseNumberLabel(index: number): string {
  return ARABIC_CLAUSE_NUMBERS[index] ?? String(index + 1);
}

export { isRestaurantCafeCategoryExact };
