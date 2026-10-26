import {
  BoardSkeleton,
  PageHeaderSkeleton,
  StatGridSkeleton,
} from "@/components/ui/skeletons";

export default function FieldOpsLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton count={3} />
      <BoardSkeleton columns={3} />
    </>
  );
}
