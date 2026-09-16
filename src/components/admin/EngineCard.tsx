"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LoadingBlock } from "@/components/ui/Feedback";
import { Switch } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/hooks/useAction";
import { ago } from "./format";
import { useNow, useStaff } from "./hooks";

/**
 * Prototype `engineCard()` — the admin master switch. While off, captured leads are held in the queue
 * (nothing is lost); releasing the queue distributes them oldest-first. Only `distribution.manage`
 * may flip it; other roles see the state read-only.
 */
export function EngineCard() {
  const status = useQuery(api.distribution.admin.queueStatus);
  const { can } = useStaff();
  const now = useNow();
  const toast = useToast();
  const setEngineEnabled = useMutation(api.distribution.admin.setEngineEnabled);
  const releaseQueue = useMutation(api.distribution.admin.releaseQueue);
  const [toggle, toggling] = useAction(async (enabled: boolean) => {
    await setEngineEnabled({ enabled });
    if (enabled) toast.success("Distribution switched on", "New leads are released as they arrive. Release the queue to send the backlog.");
    else toast.warn("Distribution switched off", "Incoming leads are held in the queue. Nothing is lost.");
  });
  const [release, releasing] = useAction(() => releaseQueue({}), {
    success: (r) => (r.considered ? `Releasing ${r.considered} held lead${r.considered === 1 ? "" : "s"}` : "The queue is already clear"),
    successBody: "Oldest first, one transaction per lead. Watch the unassigned queue for anything nobody can take.",
  });

  if (status === undefined) return <LoadingBlock rows={3} label="Loading distribution status" />;

  const on = status.engineEnabled;
  const manage = can("distribution.manage");
  const held = status.heldCount;
  const recipients = status.standardRecipientCount;

  return (
    <Card style={{ borderLeft: `3px solid var(${on ? "--green" : "--red"})` }}>
      <CardHeader
        title="Lead distribution"
        description="The master switch. Nothing is released to any agent while this is off."
        actions={
          on ? (
            <Badge tone="g" dot>
              Sending
            </Badge>
          ) : (
            <Badge tone="r" dot>
              Stopped
            </Badge>
          )
        }
      />
      <CardBody>
        <div style={{ marginBottom: ".9rem" }}>
          <Switch
            checked={on}
            disabled={!manage || toggling}
            onChange={(next) => void toggle(next)}
            label={on ? "Sending leads to agents" : "Turn on and start sending leads"}
          />
          {!manage && <p className="xs" style={{ marginTop: ".35rem" }}>Only an administrator can switch distribution on or off.</p>}
        </div>
        <div className="g g2" style={{ gap: ".6rem", marginBottom: ".9rem" }}>
          <div className="crd" style={{ padding: ".65rem .8rem" }}>
            <div className="t" style={{ fontSize: ".65rem" }}>
              Waiting in queue
            </div>
            <div className="v" style={{ fontSize: "1.4rem", margin: ".1rem 0 0" }}>
              {held}
            </div>
            <div className="xs">{held && status.oldestHeldAt ? `Oldest ${ago(status.oldestHeldAt, now)}` : "Queue clear"}</div>
          </div>
          <div className="crd" style={{ padding: ".65rem .8rem" }}>
            <div className="t" style={{ fontSize: ".65rem" }}>
              Released, 24h
            </div>
            <div className="v" style={{ fontSize: "1.4rem", margin: ".1rem 0 0" }}>
              {status.releasedLast24h}
            </div>
            <div className="xs">
              Exclusive to 1 agent · standard to up to {recipients}
            </div>
          </div>
        </div>
        {held > 0 && manage && (
          <Button
            variant={on ? "navy" : "out"}
            size="s"
            full
            icon="play"
            loading={releasing}
            disabled={!on}
            title={on ? undefined : "Turn distribution on first"}
            onClick={() => void release()}
          >
            Release the queue now — {held} lead{held === 1 ? "" : "s"}
          </Button>
        )}
        <p className="xs" style={{ marginTop: ".7rem" }}>
          Turning this off queues incoming leads rather than dropping them. Nothing is lost and nothing expires; when you switch it back on and release the
          queue, the backlog goes out oldest-first — each exclusive lead to one agent, each standard lead to up to {recipients} agent
          {recipients === 1 ? "" : "s"}.
        </p>
      </CardBody>
    </Card>
  );
}
