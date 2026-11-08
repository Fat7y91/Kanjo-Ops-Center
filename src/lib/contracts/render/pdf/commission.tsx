import { Text, View } from "@react-pdf/renderer";

import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";
import { styles } from "./styles";

type CommissionProps = { input: ContractDocumentInput };

type Row = { label: string; rate: number };

/**
 * "ملحق العمولات" table. Rendered only when the contract carries an explicit
 * base rate or category exceptions, matching the V1 condition.
 */
export function CommissionTable({ input }: CommissionProps) {
  const exceptions = input.exceptions ?? [];
  if (input.baseCommission === null && exceptions.length === 0) return null;

  const rows: Row[] = [];
  if (input.baseCommission !== null) {
    rows.push({ label: "العمولة الأساسية (جميع المنتجات)", rate: input.baseCommission });
  }
  for (const ex of exceptions) rows.push({ label: ex.category, rate: ex.rate });

  return (
    <View style={styles.clauseWrapper} wrap={false}>
      <Text style={styles.clauseTitle}>
        ملحق العمولات: نسبة مقابل خدمات المنصة والتشغيل
      </Text>
      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.tdRight]}>الفئة / النشاط</Text>
          <Text style={[styles.th, styles.tdCenter]}>نسبة مقابل خدمات المنصة</Text>
        </View>
        {rows.map((row) => (
          <View key={row.label} style={styles.tableRow}>
            <Text style={[styles.td, styles.tdRight]}>{row.label}</Text>
            <Text style={[styles.td, styles.tdCenter]}>{toArabicNumerals(row.rate)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
