import { PageHeader } from "@/components/ui/page-header";
import { CapitalDepositCard } from "@/components/profile/capital-deposit-card";
import { PayoutMethodCard } from "@/components/profile/payout-method-card";
import { ProfileIdentityCard } from "@/components/profile/profile-identity-card";
import { ProfilePasswordCard } from "@/components/profile/profile-password-card";
import { requireSession } from "@/lib/auth/guard";
import { loadCapitalBoard } from "@/lib/profile/capital-service";
import { loadProfileSnapshot } from "@/lib/profile/profile";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * The operator's own profile.
 *
 * Every read is scoped to the session subject, so the page needs no capability
 * guard beyond being signed in: each operator may see and edit exactly their
 * own row. Treasury review is a separate surface.
 */
export default async function ProfilePage() {
  const session = await requireSession();

  const [snapshot, capital] = await Promise.all([
    loadProfileSnapshot(session.user.id).catch(() => ({
      profile: null,
      payoutMethod: null,
    })),
    loadCapitalBoard({ founderId: session.user.id, canDecide: false }).catch(
      () => ({ deposits: [], accounts: [] }),
    ),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="الحساب"
        title="ملفي الشخصي"
        description="بياناتك، وكلمة المرور، ووجهة الصرف، ورأس المال الذي أودعته."
      />

      <div className="profile-layout">
        <ProfileIdentityCard initial={snapshot.profile} />
        <PayoutMethodCard initial={snapshot.payoutMethod} />
        <CapitalDepositCard initialDeposits={capital.deposits} />
        <ProfilePasswordCard />
      </div>
    </>
  );
}
