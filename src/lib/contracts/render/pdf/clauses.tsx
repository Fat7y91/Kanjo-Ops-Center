import { Text, View } from "@react-pdf/renderer";

import { buildClauses, clauseNumberLabel } from "../clauses";
import type { ContractDocumentInput } from "../input";
import { resolveLegalContext } from "../legal-context";
import { Inline, splitFillLines } from "./inline";
import { styles } from "./styles";

type ClausesProps = { input: ContractDocumentInput };

/** The numbered legal clauses, each as a titled block. */
export function Clauses({ input }: ClausesProps) {
  const { financialSpecialException, jurisdictionClause } = resolveLegalContext(input);
  const clauses = buildClauses({
    category: input.category,
    achievedPercent: input.displayRate,
    financialSpecialException,
    jurisdictionClause,
  });

  return (
    <View>
      {clauses.map((clause, index) => {
        const { prose, fillLines } = splitFillLines(clause.body);
        return (
          <View key={clause.title} style={styles.clauseWrapper} wrap={false}>
            <Text style={styles.clauseTitle}>
              البند {clauseNumberLabel(index)}: {clause.title}
            </Text>
            <Inline html={prose} style={styles.clauseBody} />
            {Array.from({ length: fillLines }).map((_, i) => (
              <View key={i} style={styles.rule} />
            ))}
          </View>
        );
      })}
    </View>
  );
}
