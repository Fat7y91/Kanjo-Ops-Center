import {
  PageHeaderSkeleton,
  ProfileSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function MerchantProfileLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <ProfileSkeleton />
      <TableSkeleton rows={4} columns={4} />
    </>
  );
}
