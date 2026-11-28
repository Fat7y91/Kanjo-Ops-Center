import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function MerchantsLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={6} />
    </>
  );
}
