import {
  CardGridSkeleton,
  PageHeaderSkeleton,
  StatGridSkeleton,
} from "@/components/ui/skeletons";

export default function CatalogLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <CardGridSkeleton count={4} />
    </>
  );
}
