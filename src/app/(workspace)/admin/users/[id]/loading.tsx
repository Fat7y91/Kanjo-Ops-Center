import { UserDetailLoading } from "@/components/admin/user-detail-loading";

/**
 * Route-level fallback for /admin/users/[id].
 *
 * Mirrors the Suspense fallback so the instant skeleton is identical whether
 * Next streams the route boundary or the in-page boundary catches the fetch.
 */
export default function Loading() {
  return <UserDetailLoading />;
}
