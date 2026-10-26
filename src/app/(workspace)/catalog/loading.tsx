import {
  CardGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/ui/skeletons";

export default function CatalogLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardGridSkeleton count={4} />
    </>
  );
}
