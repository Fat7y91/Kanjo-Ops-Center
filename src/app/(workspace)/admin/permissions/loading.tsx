import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function PermissionsLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </>
  );
}
