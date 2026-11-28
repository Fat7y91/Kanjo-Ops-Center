import {
  CardGridSkeleton,
  MapSkeleton,
  PageHeaderSkeleton,
} from "@/components/ui/skeletons";

export default function CitiesLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <MapSkeleton height={360} />
      <CardGridSkeleton count={6} />
    </>
  );
}
