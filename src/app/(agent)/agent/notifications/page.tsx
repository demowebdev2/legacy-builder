"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LoadMore } from "@/components/ui/Navigation";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/domain/format";
import { useAction } from "@/hooks/useAction";

const CHANNEL: Record<string, string> = { in_app: "In-app", email: "Email", sms: "SMS" };
const TYPE_ICON: Record<string, IconName> = { lead: "inbox", leads: "coin", billing: "card", dispute: "flow", licence: "badge", compliance: "warn", account: "user" };

/** Only follow in-portal links that this signed-in agent can open. */
function safeLink(link: string | undefined, producer: boolean) {
  if (!link || !link.startsWith("/agent")) return null;
  if (producer && /^\/agent\/(balance|purchases|preferences|team)/.test(link)) return null;
  return link;
}

export default function NotificationsPage() {
  const router = useRouter();
  const agent = useAgentAccount();
  const feed = usePaginatedQuery(api.notifications.mine, {}, { initialNumItems: 20 });
  const unread = useQuery(api.notifications.myUnreadCount);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [readAll, readingAll] = useAction(() => markAllRead({}), { success: "All marked read" });

  const open = (n: Doc<"notifications">) => {
    if (!n.readAt) markRead({ notificationId: n._id }).catch(() => undefined);
    const link = safeLink(n.link, agent?.producer ?? false);
    if (link) router.push(link);
  };

  if (feed.status === "LoadingFirstPage") {
    return (
      <>
        <PageHeader title="Notifications" />
        <LoadingBlock rows={6} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Notifications" />
      {feed.results.length === 0 ? (
        <div className="card">
          <EmptyState icon="bell" title="You are all caught up">
            New releases, low-balance warnings and billing events land here.
          </EmptyState>
        </div>
      ) : (
        <Card>
          <CardHeader
            title={`${unread ?? feed.results.filter((n) => !n.readAt).length} unread`}
            actions={
              <Button variant="out" size="s" loading={readingAll} disabled={unread === 0} onClick={() => void readAll()}>
                Mark all read
              </Button>
            }
          />
          <CardBody className="stack" style={{ gap: ".6rem" }}>
            {feed.results.map((n) => {
              const link = safeLink(n.link, agent?.producer ?? false);
              return (
                <button key={n._id} type="button" className={cn("nt", !n.readAt && "unread")} onClick={() => open(n)} aria-label={`${n.title}${n.readAt ? "" : " (unread)"}`}>
                  <span className="iconsm">
                    <Icon name={TYPE_ICON[n.type] ?? "bell"} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: "block" }}>
                    <span className="row-b" style={{ gap: ".5rem" }}>
                      <span className="strong">{n.title}</span>
                      <span className="xs nowrap">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="sm" style={{ display: "block" }}>
                      {n.body}
                    </span>
                    <span className="row" style={{ gap: ".3rem", marginTop: ".4rem" }}>
                      {n.channels.map((c) => (
                        <span key={c} className="pfill">
                          {CHANNEL[c] ?? c}
                        </span>
                      ))}
                      {link && (
                        <span className="xs" style={{ marginLeft: "auto", color: "var(--navy)", fontWeight: 600 }}>
                          Open →
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </CardBody>
          {(feed.status !== "Exhausted" || feed.results.length > 20) && (
            <LoadMore status={feed.status} count={feed.results.length} onLoadMore={() => feed.loadMore(20)} />
          )}
        </Card>
      )}
    </>
  );
}
