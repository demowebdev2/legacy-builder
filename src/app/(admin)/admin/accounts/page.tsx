"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { useStaffAccess } from "@/components/admin/accounts/kit";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, StatCard } from "@/components/ui/Display";
import { Alert, Avatar, EmptyState, LoadingBlock, PageLoading, Skeleton } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { LoadMore } from "@/components/ui/Navigation";
import { timeAgo } from "@/domain/format";
import { formatMoney } from "@/domain/money";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending_verification", label: "Pending verification" },
  { value: "action_required", label: "Action required" },
  { value: "suspended", label: "Suspended" },
  { value: "blocked", label: "Blocked" },
  { value: "rejected", label: "Rejected" },
  { value: "closed", label: "Closed" },
];

export default function AdminAccountsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="All accounts" />
          <PageLoading />
        </>
      }
    >
      <AccountsView />
    </Suspense>
  );
}

function AccountsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const access = useStaffAccess();

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const typeParam = params.get("type");
  const type = typeParam === "individual" || typeParam === "agency" ? typeParam : undefined;
  const balanceParam = params.get("balance");
  const balance = balanceParam === "low" || balanceParam === "empty" ? balanceParam : undefined;
  const filtered = !!(q || status || type || balance);

  const [search, setSearch] = useState(q);

  const replaceParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounce the search box into the URL so the view stays linkable.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, q, params, pathname, router]);

  const canRead = access.can("accounts.read");
  const stats = useQuery(api.accounts.adminStats, canRead ? {} : "skip");
  const list = usePaginatedQuery(
    api.accounts.adminList,
    canRead ? { search: q || undefined, status: status || undefined, type, balance } : "skip",
    { initialNumItems: 25 },
  );

  if (!canRead) {
    return (
      <>
        <PageHeader title="All accounts" />
        <div className="card">
          <EmptyState icon="lock" title="No access to accounts">
            Your role does not include account records.
          </EmptyState>
        </div>
      </>
    );
  }

  const pending = stats?.pending ?? [];

  return (
    <>
      <PageHeader title="All accounts" />

      {pending.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert kind="w">
            <b>
              {pending.length} application{pending.length > 1 ? "s are" : " is"} waiting on verification
            </b>{" "}
            — {pending.map((p) => p.name).join(", ")}. The card is authorised but not captured and no lead is released until the producer number and
            every selected state licence has been reviewed. Open the account to approve, reject, or verify a state; partial approval is allowed and
            unverified states are simply dropped from eligibility.{" "}
            <Link className="link" href={`/admin/accounts/${pending[0].id}`}>
              Open {pending[0].name} →
            </Link>
            {access.can("licenses.verify") && (
              <>
                {" "}
                ·{" "}
                <Link className="link" href="/admin/verification">
                  Verification queue →
                </Link>
              </>
            )}
          </Alert>
        </div>
      )}

      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        {stats === undefined ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat">
              <Skeleton height={12} width="50%" />
              <Skeleton height={28} width="40%" className="mt-3" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total accounts" value={stats.total} icon="users" />
            <StatCard label="Active" value={stats.active} icon="check" accent="green" />
            <StatCard label="Needs attention" value={stats.needsAttention} icon="warn" accent="red" />
            <StatCard label="Leads unworked" value={stats.leadsUnworked} icon="coin" accent="gold" sub="Bought and not yet released — no expiry" />
          </>
        )}
      </div>

      <div className="fb" role="search">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Name, email, NPN, EIN…"
            aria-label="Search accounts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select aria-label="Status" value={status} onChange={(e) => replaceParams({ status: e.target.value || undefined })}>
          <option value="">Any status</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select aria-label="Type" value={type ?? ""} onChange={(e) => replaceParams({ type: e.target.value || undefined })}>
          <option value="">Any type</option>
          <option value="individual">Individual</option>
          <option value="agency">Agency</option>
        </select>
        <select aria-label="Balance" value={balance ?? ""} onChange={(e) => replaceParams({ balance: e.target.value || undefined })}>
          <option value="">Any balance</option>
          <option value="low">Low (5 or fewer)</option>
          <option value="empty">Empty</option>
        </select>
        {filtered && (
          <Button
            variant="ghost"
            size="s"
            onClick={() => {
              setSearch("");
              replaceParams({ q: undefined, status: undefined, type: undefined, balance: undefined });
            }}
          >
            Clear
          </Button>
        )}
        <div className="spacer" />
        <span className="xs">
          {list.results.length}
          {!filtered && stats ? ` of ${stats.total}` : " shown"}
        </span>
      </div>

      {list.status === "LoadingFirstPage" ? (
        <LoadingBlock rows={8} label="Loading accounts" />
      ) : (
        <DataTable
          caption="Accounts"
          columns={[
            { label: "Account" },
            { label: "Type" },
            { label: "Bought" },
            { label: "Status" },
            { label: "Balance left" },
            { label: "Leads 30d" },
            { label: "Lifetime spend" },
            { label: "Last lead" },
          ]}
          isEmpty={list.results.length === 0}
          empty={
            <EmptyState
              icon="users"
              title={filtered ? "No accounts match" : "No accounts yet"}
              action={
                list.status === "CanLoadMore" ? (
                  <Button variant="out" size="s" onClick={() => list.loadMore(50)}>
                    Search further
                  </Button>
                ) : filtered ? (
                  <Button
                    variant="out"
                    size="s"
                    onClick={() => {
                      setSearch("");
                      replaceParams({ q: undefined, status: undefined, type: undefined, balance: undefined });
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              {filtered
                ? list.status === "CanLoadMore"
                  ? "Nothing on this page matched the balance or type filter. Older accounts have not been checked yet."
                  : "Try a different search or clear the filters."
                : "Accounts appear here as soon as an agent submits an application."}
            </EmptyState>
          }
          footer={list.results.length ? <LoadMore status={list.status} count={list.results.length} onLoadMore={() => list.loadMore(25)} /> : undefined}
        >
          {list.results.map((a) => {
            const empty = a.balance.total === 0 && a.leadsBought > 0;
            return (
              <tr key={a.id} className="clk" onClick={() => router.push(`/admin/accounts/${a.id}`)}>
                <td>
                  <div className="row" style={{ gap: ".55rem", flexWrap: "nowrap" }}>
                    <Avatar name={a.name} />
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/admin/accounts/${a.id}`} className="nm" onClick={(e) => e.stopPropagation()}>
                        {a.name}
                      </Link>
                      <span className="tsub">{a.email}</span>
                    </div>
                  </div>
                </td>
                <td className="sm">{a.type === "agency" ? "Agency" : "Individual"}</td>
                <td className="sm">
                  {a.leadsBought || "—"}
                  <span className="tsub">
                    {a.orderCount} order{a.orderCount === 1 ? "" : "s"}
                  </span>
                </td>
                <td>
                  <StatusBadge status={a.status} />
                  {a.declinedPurchaseOutstanding && (
                    <span className="tsub" style={{ marginTop: ".3rem" }}>
                      <Badge tone="r">Declined purchase</Badge>
                    </span>
                  )}
                </td>
                <td className="sm nowrap" style={empty ? { color: "var(--red)", fontWeight: 700 } : undefined}>
                  {a.balance.exclusive} <span className="xs">ex</span> · {a.balance.standard} <span className="xs">std</span>
                </td>
                <td className="sm">{a.leads30d}</td>
                <td className="sm">{formatMoney(a.spendCents)}</td>
                <td className="sm nowrap">{timeAgo(a.lastAssignedAt)}</td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
