"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import { CreateLeadModal } from "@/components/admin/CreateLeadModal";
import { ago, formatUsPhone, holderSummary } from "@/components/admin/format";
import { useDebounced, useNow, useSearchParamState, useStaff } from "@/components/admin/hooks";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { LoadMore } from "@/components/ui/Navigation";
import { statusBadge } from "@/domain/status";

const LEAD_STATUSES = [
  "queued",
  "assigned",
  "partially_assigned",
  "unassigned_pending",
  "unassignable",
  "duplicate",
  "out_of_area",
  "rejected",
  "suppressed",
  "withdrawn",
] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

const PAGE_SIZE = 25;
const MAX_AUTO_LOADS = 8;

export default function AdminLeadsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RequirePermission permission="leads.read" title="All leads">
        <LeadsView />
      </RequirePermission>
    </Suspense>
  );
}

function LeadsView() {
  const router = useRouter();
  const { can } = useStaff();
  const now = useNow();
  const [params, setParams] = useSearchParamState();
  const reference = useQuery(api.referenceData.publicData);

  const status = (LEAD_STATUSES as readonly string[]).includes(params.get("status") ?? "") ? (params.get("status") as LeadStatus) : undefined;
  const product = params.get("product") || undefined;
  const state = params.get("state") || undefined;
  const typeParam = params.get("type");
  const leadType: "exclusive" | "standard" | undefined = typeParam === "exclusive" || typeParam === "standard" ? typeParam : undefined;
  const creating = params.get("create") === "1" && can("leads.manage");

  const [search, setSearch] = useState(params.get("q") ?? "");
  const debouncedSearch = useDebounced(search.trim(), 350);
  const urlSearch = params.get("q") ?? "";
  const lastPushedSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (debouncedSearch === lastPushedSearch.current) return;
    lastPushedSearch.current = debouncedSearch;
    setParams({ q: debouncedSearch || null });
  }, [debouncedSearch, setParams]);

  const args = { search: urlSearch || undefined, status, coverageType: product, state, leadType };
  const { results, status: pageStatus, loadMore } = usePaginatedQuery(api.leads.adminList, args, { initialNumItems: PAGE_SIZE });

  // Product, state and type are applied after pagination on the server, so a filtered page can come back
  // short. Pull a few more pages automatically so the table is not misleadingly empty.
  const postFiltered = !!(product || state || leadType) && !urlSearch;
  const autoLoads = useRef(0);
  const filterKey = JSON.stringify(args);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      autoLoads.current = 0;
    }
    if (postFiltered && pageStatus === "CanLoadMore" && results.length < PAGE_SIZE && autoLoads.current < MAX_AUTO_LOADS) {
      autoLoads.current += 1;
      loadMore(PAGE_SIZE * 2);
    }
  }, [filterKey, postFiltered, pageStatus, results.length, loadMore]);

  const actions = useMemo(
    () =>
      can("leads.manage") ? (
        <ButtonLink href="/admin/leads?create=1" variant="navy" size="s" icon="plus">
          New lead
        </ButtonLink>
      ) : undefined,
    [can],
  );

  const anyFilter = !!(urlSearch || status || product || state || leadType);
  const clear = () => {
    setSearch("");
    setParams({ q: null, status: null, product: null, state: null, type: null });
  };

  return (
    <>
      <PageHeader title="All leads" actions={actions} />
      <div className="fb" role="search">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search leads"
            placeholder="Reference, name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select aria-label="Status" value={status ?? ""} onChange={(e) => setParams({ status: e.target.value || null })}>
          <option value="">Any status</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusBadge(s)[1]}
            </option>
          ))}
        </select>
        <select aria-label="Product" value={product ?? ""} onChange={(e) => setParams({ product: e.target.value || null })}>
          <option value="">Any product</option>
          {(reference?.coverageTypes ?? []).map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="State" value={state ?? ""} onChange={(e) => setParams({ state: e.target.value || null })}>
          <option value="">Any state</option>
          {(reference?.states ?? []).map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <select aria-label="Lead type" value={leadType ?? ""} onChange={(e) => setParams({ type: e.target.value || null })}>
          <option value="">Any type</option>
          <option value="exclusive">Exclusive</option>
          <option value="standard">Standard</option>
        </select>
        {anyFilter && (
          <Button variant="ghost" size="s" onClick={clear}>
            Clear
          </Button>
        )}
        <div className="spacer" />
        <span className="xs">{pageStatus === "LoadingFirstPage" ? "Loading…" : `${results.length}${pageStatus === "Exhausted" ? "" : "+"} shown`}</span>
        {can("leads.manage") && (
          <Button variant="out" size="s" icon="plus" onClick={() => setParams({ create: "1" })}>
            Create lead
          </Button>
        )}
      </div>
      {urlSearch && (
        <p className="xs" style={{ margin: "-.4rem 0 .8rem" }}>
          Search shows the 50 best matches.
        </p>
      )}

      {pageStatus === "LoadingFirstPage" ? (
        <LoadingBlock rows={8} label="Loading leads" />
      ) : (
        <DataTable
          caption="Leads"
          columns={[
            { label: "Reference" },
            { label: "Consumer" },
            { label: "Product" },
            { label: "Where" },
            { label: "Type" },
            { label: "Status" },
            { label: "Held by" },
            { label: "Captured" },
          ]}
          isEmpty={results.length === 0}
          empty={
            <EmptyState
              icon="inbox"
              title={anyFilter ? "No leads match" : "No leads yet"}
              action={
                anyFilter ? (
                  <Button variant="out" size="s" onClick={clear}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              {anyFilter
                ? pageStatus === "CanLoadMore"
                  ? "Nothing in the most recent leads matches these filters. Load older leads below, or change the filters."
                  : "No records match the current filters."
                : "Captured leads appear here the moment they arrive."}
            </EmptyState>
          }
          footer={<LoadMore status={pageStatus} count={results.length} onLoadMore={() => loadMore(PAGE_SIZE)} />}
        >
          {results.map((l) => {
            const holder = holderSummary(l.holders);
            return (
              <tr key={l.id} className="clk" onClick={() => router.push(`/admin/leads/${l.id}`)}>
                <td>
                  <Link href={`/admin/leads/${l.id}`} className="mono nm nowrap" onClick={(e) => e.stopPropagation()}>
                    {l.reference}
                  </Link>
                </td>
                <td>
                  <span className="nm">{l.name}</span>
                  <span className="tsub">{formatUsPhone(l.phone)}</span>
                </td>
                <td className="sm">{l.coverageName}</td>
                <td className="sm">
                  {l.city ?? "—"}
                  <span className="tsub">{l.state}</span>
                </td>
                <td>
                  <LeadTypeBadge type={l.leadType} />
                </td>
                <td>
                  <StatusBadge status={l.status} />
                  {l.leadType === "standard" && l.assignedCount > 0 && (
                    <span className="tsub">
                      {l.assignedCount} of {l.recipientTarget} recipients
                    </span>
                  )}
                </td>
                <td className="sm">{holder ?? <span className="xs">—</span>}</td>
                <td className="sm nowrap">{ago(l.capturedAt, now)}</td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <CreateLeadModal open={creating} onClose={() => setParams({ create: null })} />
    </>
  );
}
