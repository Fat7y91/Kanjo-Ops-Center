import { Text, View } from "@react-pdf/renderer";

import { KANJO_FIRST_PARTY } from "../constants";
import type { ContractDocumentInput } from "../input";
import { styles } from "./styles";

const FILL = "....................................";

/**
 * Identification numbers mix Arabic-Indic digits with hyphens; nesting a
 * left-to-right `Text` run keeps the digits from being reordered by the
 * surrounding right-to-left paragraph.
 */
function LtrNumber({ value }: { value: string }) {
  return <Text style={{ direction: "ltr" }}>{value}</Text>;
}

type PartiesProps = { input: ContractDocumentInput };

function FirstParty() {
  return (
    <View style={[styles.panel, styles.panelFirst]}>
      <Text>
        <Text style={styles.bold}>الطرف الأول: </Text>
        {KANJO_FIRST_PARTY.tradeName}
      </Text>
      <Text style={{ marginTop: 4 }}>
        السجل التجاري رقم (<LtrNumber value={KANJO_FIRST_PARTY.commercialRegister} />) —{" "}
        {KANJO_FIRST_PARTY.commercialRegisterOffice}
      </Text>
      <Text>
        البطاقة الضريبية رقم (<LtrNumber value={KANJO_FIRST_PARTY.taxCard} />) —{" "}
        {KANJO_FIRST_PARTY.taxOffice}
      </Text>
      <Text>المقر: {KANJO_FIRST_PARTY.address}</Text>
      <Text>ويمثلها م/ محمود الجمل بصفته مدير التشغيل والتعاقدات.</Text>
    </View>
  );
}

function SecondParty({ input }: PartiesProps) {
  const merchantName = input.merchantName;
  const contactName = input.contactName || FILL;
  const phone = input.contactPhone || FILL;
  const address = input.address || FILL;

  return (
    <View style={[styles.panel, styles.panelSecond]}>
      <Text>
        <Text style={styles.bold}>الطرف الثاني: </Text>
        {input.businessType}: {merchantName}
      </Text>
      <View style={[styles.row, { marginTop: 4 }]}>
        <Text style={styles.rowLabel}>اسم المنشأة / المحل:</Text>
        <Text style={styles.rowValue}>{merchantName}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>اسم المفوض / صاحب النشاط:</Text>
        <Text style={styles.rowValue}>{contactName}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>بطاقة الرقم القومي (١٤ رقمًا):</Text>
        <Text style={styles.rowValue}>{FILL}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>رقم السجل التجاري:</Text>
        <Text style={styles.rowValue}>{FILL}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>رقم التسجيل الضريبي:</Text>
        <Text style={styles.rowValue}>{FILL}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>رقم الهاتف / واتساب:</Text>
        <Text style={styles.rowValue}>{phone}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>البريد الإلكتروني:</Text>
        <Text style={styles.rowValue}>{FILL}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>العنوان:</Text>
        <Text style={styles.rowValue}>{address}</Text>
      </View>
    </View>
  );
}

/** First- and second-party identification panels plus the date preamble. */
export function Parties({ input }: PartiesProps) {
  return (
    <View>
      <Text style={styles.paragraph}>
        إنه في يوم: ............................ الموافق: ...... / ...... / ............ م،
        تم الاتفاق والتراضي بين كل من:
      </Text>
      <FirstParty />
      <SecondParty input={input} />
    </View>
  );
}
