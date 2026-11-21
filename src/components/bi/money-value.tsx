import { amount, currencySymbol } from "@/lib/bi/format";

type MoneyValueProps = {
  value: number;
  currency: "EGP" | "SAR";
};

/**
 * A money figure with its currency glyph set apart.
 *
 * The glyph used to be part of one `Intl` currency string, so it inherited the
 * headline size, rendered dark, and could wrap onto its own line. Splitting the
 * amount and the symbol keeps the number prominent and the currency small and
 * inline.
 */
export function MoneyValue({ value, currency }: MoneyValueProps) {
  return (
    <span className="bi-money" dir="ltr">
      <span className="bi-money-amount">{amount(value)}</span>
      <span className="bi-money-symbol">{currencySymbol(currency)}</span>
    </span>
  );
}
