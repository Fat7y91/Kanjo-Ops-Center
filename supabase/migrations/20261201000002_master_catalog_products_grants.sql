begin;

-- The master catalog is server-read reference data. The API uses the service
-- role (RLS is enabled, so anon/authenticated clients stay blocked), which
-- needs an explicit grant on tables created outside Supabase's public schema.
grant select on app.master_catalog_products to service_role;

commit;
