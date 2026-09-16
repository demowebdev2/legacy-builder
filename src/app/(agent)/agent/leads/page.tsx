"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { Pager, Tabs } from "@/components/ui/Navigation";
import { timeAgo } from "@/domain/format";

const PAGE_SIZE = 25;
const TABS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "sold", label: "Sold" },
  { key: "lost", label: "Lost" },
] as const;
const FILTER_KEYS = ["q", "product", "state", "type", "handout"] as const;

export default function LeadsPage() {
  return (
    <>
      <PageHeader title="My leads" />
      <Suspense fallback={<LoadingBlock rows={8} />}>
        <LeadsView />
      </Suspense>
    </>
  );
}

function LeadsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const agent = useAgentAccount();

  const status = TABS.some((t) => t.key === params.get("status")) ? (params.get("status") as string) : "all";
  const product = params.get("product") ?? "";
  const state = params.get("state") ?? "";
  const type = params.get("type") ?? "";
  const handout = params.get("handout") ?? "";
  const urlQuery = params.get("q") ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const [search, setSearch] = useState(urlQuery);

  const setParams = useMemo(
    () => (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Debounce the search box into the URL.
  useEffect(() => {
    if (search.trim() === urlQuery) return;
    const t = setTimeout(() => setParams({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [search, urlQuery, setParams]);

  const data = useQuery(api.leads.myLeads, {
    status,
    search: urlQuery || undefined,
    coverageType: product || undefined,
    state: state || undefined,
    leadType: type === "exclusive" || type === "standard" ? type : undefined,
    handout: handout === "pool" || handout === "handed" ? handout : undefined,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  const reference = useQuery(api.referenceData.publicData);
  const prefs = useQuery(api.preferences.mine, agent && !agent.producer ? {} : "skip");

  const stateNames = useMemo(() => new Map((reference?.states ?? []).map((s) => [s.code, s.name])), [reference]);
  const filtered = FILTER_KEYS.some((k) => params.get(k));

  const tabHref = (key: string) => {
    const next = new URLSearchParams(params.toString());
    if (key === "all") next.delete("status");
    else next.set("status", key);
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  if (data === undefined || agent === undefined) {
    return <LoadingBlock rows={8} />;
  }

  const productCount = prefs?.preferences?.coverageTypes.length ?? 0;
  const prefStates = prefs?.preferences?.states ?? [];
  const from = data.total ? data.offset + 1 : 0;
  const to = data.offset + data.page.length;

  const empty =
    data.counts.all === 0 && !filtered ? (
      <EmptyState
        icon="inbox"
        title="No leads yet"
        action={
          agent?.producer ? undefined : (
            <ButtonLink href="/agent/preferences" variant="out" size="s">
              Review preferences
            </ButtonLink>
          )
        }
      >
        {agent?.producer
          ? "Leads appear here once your agency principal hands them to you."
          : `Your first release will land here.${prefs?.preferences ? ` Your preferences currently cover ${productCount} products across ${prefStates.length} states.` : ""}`}
      </EmptyState>
    ) : status === "new" && !filtered ? (
      <EmptyState icon="check" title="Nothing new right now">
        Every lead {agent?.producer ? "handed to you" : "released to you"} has been opened.
        {prefs?.preferences ? ` Your preferences cover ${productCount} products in ${prefStates.join(", ") || "no states yet"}.` : ""}
      </EmptyState>
    ) : (
      <EmptyState
        icon="inbox"
        title="No leads match"
        action={
          agent?.producer ? undefined : (
            <ButtonLink href="/agent/preferences" variant="out" size="s">
              Preferences
            </ButtonLink>
          )
        }
      >
        {agent?.producer
          ? "Try clearing the filters. Leads appear here once your agency principal hands them to you."
          : "Try clearing the filters, or widen your preferences to receive more."}
      </EmptyState>
    );

  return (
    <>
      <Tabs label="Lead status" active={status} items={TABS.map((t) => ({ key: t.key, label: t.label, count: data.counts[t.key] ?? 0, href: tabHref(t.key) }))} />

      <div className="fb">
        <div className="search">
          <Icon name="search" />
          <input type="search" placeholder="Name, reference, phone…" aria-label="Search leads" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select aria-label="Product" value={product} onChange={(e) => setParams({ product: e.target.value || null })}>
          <option value="">All products</option>
          {(reference?.coverageTypes ?? []).map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="State" value={state} onChange={(e) => setParams({ state: e.target.value || null })}>
          <option value="">All states</option>
          {data.states.map((s) => (
            <option key={s} value={s}>
              {stateNames.get(s) ?? s}
            </option>
          ))}
        </select>
        <select aria-label="Lead type" value={type} onChange={(e) => setParams({ type: e.target.value || null })}>
          <option value="">Any type</option>
          <option value="exclusive">Exclusive</option>
          <option value="standard">Standard</option>
        </select>
        {agent?.principal && (
          <select aria-label="Handout" value={handout} onChange={(e) => setParams({ handout: e.target.value || null })}>
            <option value="">Pool and handed out</option>
            <option value="pool">In the agency pool</option>
            <option value="handed">Handed to a producer</option>
          </select>
        )}
        {filtered && (
          <Button
            variant="ghost"
            size="s"
            onClick={() => {
              setSearch("");
              setParams({ q: null, product: null, state: null, type: null, handout: null });
            }}
          >
            Clear
          </Button>
        )}
        <div className="spacer" />
        <span className="xs">
          {data.total} of {data.counts.all}
        </span>
      </div>

      <DataTable
        caption="Leads released to you"
        isEmpty={data.page.length === 0}
        empty={<div className="card">{empty}</div>}
        columns={[{ label: "Lead" }, { label: "Product" }, { label: "Where" }, { label: "Type" }, { label: "Status" }, { label: "Released" }]}
        footer={
          data.total > PAGE_SIZE ? (
            <Pager
              label={`${from}–${to} of ${data.total}`}
              canPrev={page > 1}
              canNext={to < data.total}
              onPrev={() => setParams({ page: page > 2 ? String(page - 1) : null })}
              onNext={() => setParams({ page: String(page + 1) })}
            />
          ) : undefined
        }
      >
        {data.page.map((l) => {
          const href = `/agent/leads/${l.assignmentId}`;
          return (
            <tr key={l.assignmentId} className="clk" onClick={() => router.push(href)}>
              <td>
                <Link href={href} className="nm">
                  {l.status === "new" && (
                    <span className="dot" style={{ display: "inline-block", background: "var(--gold)", marginRight: ".4rem" }} aria-hidden="true" />
                  )}
                  {l.name}
                </Link>
                <span className="tsub mono">
                  {l.reference}
                  {l.ceaseContact ? " · do not contact" : ""}
                </span>
              </td>
              <td>
                {l.coverageName}
                {l.coverageAmount && <span className="tsub">{l.coverageAmount}</span>}
              </td>
              <td>
                {l.city ?? stateNames.get(l.state) ?? l.state}
                <span className="tsub">{l.city ? (stateNames.get(l.state) ?? l.state) : l.state}</span>
              </td>
              <td>
                <LeadTypeBadge type={l.leadType} />
              </td>
              <td>
                <StatusBadge status={l.status} />
                {agent?.principal && <span className="tsub">{l.producerMemberId ? "Handed out" : "In pool"}</span>}
              </td>
              <td className="sm nowrap">{timeAgo(l.assignedAt)}</td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
