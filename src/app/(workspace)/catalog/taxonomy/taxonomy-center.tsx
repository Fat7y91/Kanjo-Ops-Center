"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { usePermission } from "@/components/auth/use-permission";
import { TaxonomyRequestButton } from "@/components/taxonomy/taxonomy-request-button";
import { TaxonomyRequestsPane } from "@/components/taxonomy/taxonomy-requests-pane";
import { TaxonomySyncModal } from "@/components/taxonomy/taxonomy-sync-modal";
import {
  CategoriesPane,
  VariantsPane,
  VendorTypesPane,
} from "./taxonomy-catalog-panes";
import {
  TAXONOMY_KIND_META,
  TAXONOMY_STATUS_META,
  type TaxonomyCategory,
  type TaxonomyKind,
  type TaxonomyRequest,
  type TaxonomyVendorType,
  type TaxonomyVariant,
} from "@/lib/taxonomy/types";

type Snapshot = {
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
};

type TaxonomyCenterProps = {
  initialSnapshot: Snapshot;
  initialRequests: TaxonomyRequest[];
  initialRevision: number;
  viewerName: string;
};

type TabKey = "requests" | "vendor_types" | "categories" | "variants";

const TABS: { key: TabKey; label: string }[] = [
  { key: "requests", label: "طلبات الإضافة" },
  { key: "vendor_types", label: "أنواع التجار" },
  { key: "categories", label: "التصنيفات" },
  { key: "variants", label: "المتغيرات" },
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function TaxonomyCenter({
  initialSnapshot,
  initialRequests,
  initialRevision,
  viewerName,
}: TaxonomyCenterProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [requests, setRequests] = useState<TaxonomyRequest[]>(initialRequests);
  const [revision, setRevision] = useState(initialRevision);
  const { hasPermission } = usePermission();
  // Each tab and mutation maps to its own capability. The page opens on any one
  // of them, and the operator only sees the surfaces their grants unlock.
  const canDecide = hasPermission("review_add_requests");
  const canManageVendorTypes = hasPermission("manage_merchant_types");
  const canManageCategories = hasPermission("manage_categories");
  const canManageVariants = hasPermission("manage_variables");
  // `manage_categories` is the umbrella grant: it also approves requests.
  const canApproveRequests = canManageCategories || canDecide;
  // Only render the tabs this operator's grants unlock. `manage_categories` is
  // the umbrella grant and unlocks all of them.
  const visibleTabs = TABS.filter((entry) => {
    if (canManageCategories) return true;
    if (entry.key === "requests") return canDecide;
    if (entry.key === "vendor_types") return canManageVendorTypes;
    if (entry.key === "categories") return canManageCategories;
    if (entry.key === "variants") return canManageVariants;
    return false;
  });
  const [tab, setTab] = useState<TabKey>(visibleTabs[0]?.key ?? "requests");
  const [vendorFilter, setVendorFilter] = useState<number | "all">("all");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [toast, setToast] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [snapshotResponse, requestsResponse] = await Promise.all([
        fetch("/api/taxonomy", { cache: "no-store" }),
        fetch("/api/taxonomy/requests", { cache: "no-store" }),
      ]);
      if (!snapshotResponse.ok || !requestsResponse.ok) return;
      const snapshotPayload = (await snapshotResponse.json()) as Snapshot & {
        revision: number;
      };
      const requestsPayload = (await requestsResponse.json()) as {
        requests: TaxonomyRequest[];
        revision: number;
      };
      setSnapshot({
        vendorTypes: snapshotPayload.vendorTypes ?? [],
        categories: snapshotPayload.categories ?? [],
        variants: snapshotPayload.variants ?? [],
      });
      setRequests(requestsPayload.requests ?? []);
      setRevision(requestsPayload.revision ?? snapshotPayload.revision ?? 0);
    } catch {
      /* keep last known state */
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const vendorTypeMap = useMemo(
    () => new Map(snapshot.vendorTypes.map((vendor) => [vendor.id, vendor])),
    [snapshot.vendorTypes],
  );

  const filteredCategories = useMemo(() => {
    const query = categoryQuery.trim();
    return snapshot.categories
      .filter((category) =>
        vendorFilter === "all" ? true : category.vendorTypeId === vendorFilter,
      )
      .filter((category) =>
        query.length === 0
          ? true
          : category.name_ar.includes(query) ||
            category.name_en.toLowerCase().includes(query.toLowerCase()) ||
            String(category.id) === query,
      )
      .sort(
        (left, right) =>
          left.vendorTypeId - right.vendorTypeId ||
          left.sortOrder - right.sortOrder,
      );
  }, [snapshot.categories, vendorFilter, categoryQuery]);

  const requestTaxonomy: TaxonomyVendorType[] = snapshot.vendorTypes;
  const pendingCount = requests.filter(
    (request) => request.status === "pending",
  ).length;

  const announce = useCallback(
    (message: string) => {
      setToast(message);
      void refresh();
    },
    [refresh],
  );

  return (
    <>
      <section className="panel">
        <div className="taxonomy-tabs" role="tablist">
          {visibleTabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              className={`taxonomy-tab${tab === entry.key ? " is-active" : ""}`}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
              {entry.key === "requests" && pendingCount > 0 ? (
                <span className="taxonomy-tab-count">{pendingCount}</span>
              ) : null}
            </button>
          ))}
          <span className="taxonomy-revision">rev {revision}</span>
          {canManageCategories ? (
            <button
              type="button"
              className="button button-small taxonomy-sync-trigger"
              onClick={() => setSyncOpen(true)}
            >
              مزامنة لوحة التحكم
            </button>
          ) : null}
        </div>

        {tab === "requests" ? (
          <div className="taxonomy-pane">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">قائمة الانتظار</p>
                <h2>طلبات بانتظار قرار</h2>
              </div>
              <div className="row-actions">
                <TaxonomyRequestButton
                  kind="vendor_type"
                  vendorTypes={requestTaxonomy}
                  onRequested={announce}
                />
                <TaxonomyRequestButton
                  kind="category"
                  vendorTypes={requestTaxonomy}
                  onRequested={announce}
                />
              </div>
            </div>

            <TaxonomyRequestsPane
              requests={requests}
              vendorTypeMap={vendorTypeMap}
              canDecide={canApproveRequests}
              onChanged={announce}
            />
          </div>
        ) : null}

        {tab === "vendor_types" ? (
          <VendorTypesPane
            vendorTypes={snapshot.vendorTypes}
            requestButton={
              <TaxonomyRequestButton
                kind="vendor_type"
                vendorTypes={requestTaxonomy}
                onRequested={announce}
              />
            }
          />
        ) : null}

        {tab === "categories" ? (
          <CategoriesPane
            categories={filteredCategories}
            vendorTypes={snapshot.vendorTypes}
            vendorTypeMap={vendorTypeMap}
            vendorFilter={vendorFilter}
            query={categoryQuery}
            onVendorFilter={setVendorFilter}
            onQuery={setCategoryQuery}
            requestButton={
              <TaxonomyRequestButton
                kind="category"
                vendorTypes={requestTaxonomy}
                onRequested={announce}
              />
            }
          />
        ) : null}

        {tab === "variants" ? (
          <VariantsPane
            variants={snapshot.variants}
            requestButton={
              <TaxonomyRequestButton
                kind="variant"
                vendorTypes={requestTaxonomy}
                onRequested={announce}
              />
            }
          />
        ) : null}
      </section>

      <TaxonomySyncModal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        onSynced={(message) => {
          setToast(message);
          void refresh();
        }}
      />

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
