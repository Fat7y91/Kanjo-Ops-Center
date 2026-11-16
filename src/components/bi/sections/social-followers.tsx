import { Sparkline } from "@/components/bi/sparkline";
import { compact } from "@/lib/bi/format";
import { shortDate } from "@/lib/accounts/format";
import {
  SOCIAL_PLATFORM_META,
  type SocialSummary,
} from "@/lib/marketing/social/types";

type SocialFollowersProps = {
  social: SocialSummary | null;
};

export function SocialFollowers({ social }: SocialFollowersProps) {
  if (!social) return null;

  if (social.accounts.length === 0) {
    return (
      <div className="bi-social">
        <span className="bi-stat-label">متابعو المنصات</span>
        <span className="bi-stat-detail">لم تُسجل قياسات بعد.</span>
      </div>
    );
  }

  return (
    <div className="bi-social">
      <div className="bi-social-head">
        <div className="bi-trend-copy">
          <span className="bi-stat-label">متابعو المنصات</span>
          <span className="bi-stat-detail">
            {social.capturedAt
              ? `آخر تحديث ${shortDate(social.capturedAt)}`
              : "لا توجد قياسات بعد"}
          </span>
        </div>
        <div className="bi-social-total">
          <strong>{compact(social.followers)}</strong>
          <span>
            متابع
            {social.likes > 0 ? ` · ${compact(social.likes)} إعجاب` : ""}
          </span>
        </div>
        <Sparkline
          values={social.trend}
          tone="purple"
          ariaLabel="اتجاه المتابعين"
        />
      </div>

      <ul className="bi-social-list">
        {social.accounts.map((account) => (
          <li
            key={`${account.platform}:${account.accountId}`}
            className="bi-social-row"
          >
            <span className="bi-social-platform">
              {SOCIAL_PLATFORM_META[account.platform]}
            </span>
            <span className="bi-social-name">{account.accountName}</span>
            <strong>{compact(account.followers)}</strong>
            <span
              className={
                account.delta > 0
                  ? "bi-social-delta is-up"
                  : account.delta < 0
                    ? "bi-social-delta is-down"
                    : "bi-social-delta"
              }
              dir="ltr"
            >
              {account.delta > 0 ? "+" : ""}
              {compact(account.delta)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
