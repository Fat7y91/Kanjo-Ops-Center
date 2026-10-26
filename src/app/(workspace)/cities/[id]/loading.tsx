import {
  MapSkeleton,
  PageHeaderSkeleton,
  ProfileSkeleton,
} from "@/components/ui/skeletons";

export default function CityDetailsLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <ProfileSkeleton />
      <MapSkeleton height={320} />
    </>
  );
}
