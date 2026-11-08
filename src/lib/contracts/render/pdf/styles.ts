import { StyleSheet } from "@react-pdf/renderer";

/**
 * Print palette and stylesheet for the contract PDF.
 *
 * The colours mirror the V1 contract (`functions/lib/contract.js`): deep royal
 * purple and gold, not the on-screen brand tokens, so the printed document
 * matches the legal originals already in circulation.
 */

export const PDF_COLORS = {
  royal: "#4B0082",
  gold: "#F59E0B",
  ink: "#1e293b",
  muted: "#64748b",
  panel: "#F8F9FA",
  border: "#E2E8F0",
  titleBg: "#F5F3FF",
  white: "#FFFFFF",
} as const;

export const styles = StyleSheet.create({
    page: {
      fontFamily: "Cairo",
      fontSize: 10.5,
      color: PDF_COLORS.ink,
      direction: "rtl",
      paddingTop: 34,
      paddingBottom: 46,
      paddingHorizontal: 38,
    },
    watermarkWrap: {
      position: "absolute",
      top: 210,
      left: 120,
      opacity: 0.05,
    },
    watermark: { width: 300, height: 300 },

    header: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      borderBottomWidth: 3,
      borderBottomColor: PDF_COLORS.royal,
      paddingBottom: 8,
      marginBottom: 10,
    },
    headerSplit: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 3,
      borderBottomColor: PDF_COLORS.royal,
      paddingBottom: 8,
      marginBottom: 10,
    },
    logo: { width: 64, height: 64, objectFit: "contain" },
    merchantLogo: { width: 58, height: 58, objectFit: "contain" },

    title: {
      fontSize: 19,
      fontWeight: 700,
      color: PDF_COLORS.royal,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 12,
    },

    panel: {
      backgroundColor: PDF_COLORS.panel,
      borderWidth: 1,
      borderColor: PDF_COLORS.border,
      borderRadius: 6,
      padding: 9,
      marginBottom: 10,
    },
    panelFirst: { borderRightWidth: 4, borderRightColor: PDF_COLORS.royal },
    panelSecond: { borderRightWidth: 4, borderRightColor: PDF_COLORS.gold },

    body: { fontSize: 10.5, lineHeight: 1.7, color: PDF_COLORS.ink },
    bold: { fontWeight: 700 },
    paragraph: { marginBottom: 8, textAlign: "justify" },
    row: { flexDirection: "row", marginBottom: 2 },
    rowLabel: { width: "42%", color: PDF_COLORS.royal },
    rowValue: { flexGrow: 1 },

    clauseWrapper: { marginBottom: 12 },
    clauseTitle: {
      fontSize: 12,
      fontWeight: 700,
      color: PDF_COLORS.royal,
      backgroundColor: PDF_COLORS.titleBg,
      paddingVertical: 5,
      paddingHorizontal: 9,
      borderRightWidth: 4,
      borderRightColor: PDF_COLORS.gold,
      marginBottom: 5,
    },
    clauseBody: { fontSize: 10.5, lineHeight: 1.7, color: PDF_COLORS.ink, textAlign: "justify" },

    rule: {
      borderBottomWidth: 1,
      borderBottomStyle: "dashed",
      borderBottomColor: "#000000",
      height: 22,
      marginTop: 4,
    },

    table: { borderWidth: 1, borderColor: PDF_COLORS.border, marginVertical: 6 },
    tableHead: {
      flexDirection: "row",
      backgroundColor: PDF_COLORS.royal,
    },
    th: { color: PDF_COLORS.white, fontWeight: 700, padding: 6, fontSize: 10.5 },
    tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: PDF_COLORS.border },
    td: { padding: 6, fontSize: 10.5 },
    tdRight: { flexGrow: 1, textAlign: "right" },
    tdCenter: { width: 140, textAlign: "center" },

    note: {
      fontSize: 10,
      lineHeight: 1.7,
      fontWeight: 700,
      color: PDF_COLORS.royal,
      backgroundColor: PDF_COLORS.panel,
      borderWidth: 1,
      borderColor: PDF_COLORS.border,
      borderRightWidth: 4,
      borderRightColor: PDF_COLORS.gold,
      borderRadius: 5,
      padding: 9,
      marginVertical: 8,
      textAlign: "center",
    },

    signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
    signBox: {
      width: "48%",
      borderWidth: 1,
      borderColor: PDF_COLORS.border,
      borderRadius: 6,
      padding: 10,
    },
    signTitle: { color: PDF_COLORS.royal, fontWeight: 700, marginBottom: 6 },
    signGap: { marginTop: 14 },
    signSpace: { height: 64 },

    socialRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopStyle: "dashed",
      borderTopColor: PDF_COLORS.border,
    },
    social: { fontSize: 10, fontWeight: 700, color: PDF_COLORS.royal, marginHorizontal: 10, direction: "ltr" },
    copyright: {
      fontSize: 8.5,
      color: PDF_COLORS.muted,
      textAlign: "center",
      marginTop: 8,
    },

    footerWrap: {
      position: "absolute",
      bottom: 22,
      left: 38,
      right: 38,
    },
    footer: {
      textAlign: "center",
      fontSize: 9,
      fontWeight: 700,
      color: PDF_COLORS.royal,
    },
});

export type ContractStyles = typeof styles;
