import { Text, View } from "@react-pdf/renderer";

import { KANJO_FIRST_PARTY } from "../constants";
import { safeString } from "../format";
import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";
import { styles } from "./styles";

type SummaryProps = { input: ContractDocumentInput };

const FILL = "..............................";

function SignatureBox({
  title,
  nameLine,
  roleLine,
}: {
  title: string;
  nameLine: string;
  roleLine: string;
}) {
  return (
    <View style={styles.signBox}>
      <Text style={styles.signTitle}>{title}</Text>
      <Text>{nameLine}</Text>
      <Text>{roleLine}</Text>
      <View style={styles.signGap}>
        <Text style={styles.bold}>توقيع المفوض: {FILL}</Text>
      </View>
      <Text style={[styles.bold, styles.signGap]}>الختم:</Text>
      <View style={styles.signSpace} />
    </View>
  );
}

/**
 * "ملحق مختصر" — commercial category, platform rate, exceptions, VIP state and
 * the two signature boxes plus the social/copyright footer.
 */
export function Summary({ input }: SummaryProps) {
  const exceptions = input.exceptions ?? [];
  const displayRate = input.baseCommission !== null ? input.baseCommission : input.displayRate;
  const contactName = safeString(input.contactName) || FILL;

  return (
    <View wrap={false}>
      <Text style={styles.clauseTitle}>
        ملحق مختصر: البيانات والتوقيعات النهائية
      </Text>
      <Text style={[styles.paragraph, styles.bold]}>
        الفئة التجارية: {safeString(input.category)} | نسبة مقابل خدمات المنصة: [{" "}
        {toArabicNumerals(displayRate)}% ]
      </Text>

      {input.vipPreContract ? (
        <Text style={[styles.note, { color: "#92400e", textAlign: "right" }]}>
          حالة التعاقد: عرض مبدئي / تحت التعاقد (VIP) — هذا المستند عرض مبدئي غير نهائي
          ولا يترتب عليه أي التزام تعاقدي أو عمولة.
        </Text>
      ) : null}

      {exceptions.length ? (
        <Text style={[styles.paragraph, styles.bold]}>
          استثناءات النسب:{" "}
          {exceptions
            .map((ex) => `${safeString(ex.category)}: [ ${toArabicNumerals(ex.rate)}% ]`)
            .join(" — ")}
        </Text>
      ) : null}

      <View style={styles.signatures}>
        <SignatureBox
          title={`الطرف الأول: ${KANJO_FIRST_PARTY.tradeName}`}
          nameLine="الاسم: م/ محمود الجمل"
          roleLine="الصفة: مدير التشغيل والتعاقدات"
        />
        <SignatureBox
          title={`الطرف الثاني: ${input.merchantName}`}
          nameLine={`الاسم: ${contactName}`}
          roleLine="الصفة: صاحب النشاط"
        />
      </View>
    </View>
  );
}
