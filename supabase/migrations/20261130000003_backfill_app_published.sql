-- V1 marked a merchant as "منشور على التطبيق" through `dashboardUploaded`
-- + `hasPendingDashboardUpdates`. The V2 migration intentionally copied that
-- flag as false, which left the catalog publish state empty even though 39 V1
-- merchants were live. Restore the flag for the merchants that are still
-- synced in V1; the catalog screens count only those that actually have
-- products, which is the 38 V1 shows.
--
-- Ids come from the live V1 `merchants` collection: dashboardUploaded === true
-- and hasPendingDashboardUpdates !== true. The update is idempotent and does
-- not clear flags an operator set later in V2.

update app.merchant_v1_profiles
set app_published = true,
    updated_at = now()
where merchant_id in (
  'KJ-2579AN',
  'KJ-2HZN9S',
  'KJ-3BRPHG',
  'KJ-3YFGWQ',
  'KJ-4AYT64',
  'KJ-4H5PBP',
  'KJ-4TUDTJ',
  'KJ-5RWBSD',
  'KJ-6HPBS7',
  'KJ-8U57XR',
  'KJ-94R6C4',
  'KJ-9EXVP8',
  'KJ-A73KF5',
  'KJ-AF3DNM',
  'KJ-BHQ9GU',
  'KJ-D6RKPA',
  'KJ-DAE5VT',
  'KJ-EFZ2V2',
  'KJ-ETED2N',
  'KJ-FV9UA6',
  'KJ-H45B75',
  'KJ-HDW8YB',
  'KJ-MJD5DE',
  'KJ-N3K4DG',
  'KJ-NV6Q2G',
  'KJ-PHRFHZ',
  'KJ-QU6MZT',
  'KJ-R25RDX',
  'KJ-RJ5H9F',
  'KJ-RTTPMU',
  'KJ-RUFAV8',
  'KJ-SE7RS9',
  'KJ-TJWQJ8',
  'KJ-U23HES',
  'KJ-XVD82H',
  'KJ-XVRT4Q',
  'KJ-Y3BPYB',
  'KJ-YGYV6C',
  'KJ-ZNE7BY'
)
and app_published = false;
