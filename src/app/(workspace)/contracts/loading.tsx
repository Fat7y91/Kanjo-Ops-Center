import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function ContractsLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <TableSkeleton rows={5} columns={6} />
    </>
  );
}
