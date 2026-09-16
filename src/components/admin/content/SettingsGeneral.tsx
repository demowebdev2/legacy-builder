"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Chips } from "@/components/ui/Form";
import { useAction } from "@/hooks/useAction";
import { cn } from "@/lib/cn";
import { CoverageTypeModal, FORM_OPTION_GROUPS, type FormOptionGroup, FormOptionModal, MarketingSourceModal } from "./ReferenceModals";

type Editing =
  | { kind: "coverage"; row: Doc<"coverageTypes"> | null }
  | { kind: "source"; row: Doc<"marketingSources"> | null }
  | { kind: "option"; row: Doc<"formOptions"> | null; group: FormOptionGroup };

const nextSort = (rows: Array<{ sortOrder: number }>) => rows.reduce((max, r) => Math.max(max, r.sortOrder + 1), 0);

export function SettingsGeneral({ canManage }: { canManage: boolean }) {
  const data = useQuery(api.referenceData.adminData);
  const setServiced = useMutation(api.referenceData.setStateServiced);
  const upsertOption = useMutation(api.referenceData.upsertFormOption);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toggleState, toggling] = useAction(async (state: Doc<"referenceStates">) => {
    await setServiced({ stateId: state._id, serviced: !state.serviced });
    return true;
  });
  const [toggleOption, togglingOption] = useAction(
    async (row: Doc<"formOptions">) => {
      await upsertOption({ id: row._id, group: row.group, label: row.label, active: !row.active, sortOrder: row.sortOrder });
      return row.active ? "Option deactivated" : "Option reactivated";
    },
    { success: (msg) => msg },
  );

  if (data === undefined) {
    return (
      <div className="stack">
        <LoadingBlock rows={3} label="Loading reference data" />
        <LoadingBlock rows={6} label="Loading reference data" />
      </div>
    );
  }

  const servicedCount = data.states.filter((s) => s.serviced).length;
  const readOnlyNote = !canManage && <p className="xs">Read-only — changing reference data needs the settings permission.</p>;

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {!canManage && <Alert kind="n">You can view reference data. Only admins can change it.</Alert>}

      <div className="g g2" style={{ alignItems: "start" }}>
        <Card>
          <CardHeader title="Serviced states" description={`${servicedCount} of ${data.states.length} serviced`} />
          <CardBody>
            {data.states.length === 0 ? (
              <p className="sm">No states configured.</p>
            ) : (
              <Chips
                gold
                disabled={!canManage || toggling}
                options={data.states.map((s) => ({ value: s._id, label: s.name, title: `${s.code} — ${s.serviced ? "click to stop servicing" : "click to service"}` }))}
                selected={data.states.filter((s) => s.serviced).map((s) => s._id)}
                onToggle={(id) => {
                  const state = data.states.find((s) => s._id === (id as Id<"referenceStates">));
                  if (state) void toggleState(state);
                }}
              />
            )}
            <p className="xs" style={{ marginTop: ".7rem" }}>
              Reference data, not hardcoded. A lead outside these is held as out-of-area and reported rather than distributed. Changes apply to the next lead.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Lead types" description="Fixed grades — the mix is part of the commercial model" />
          <CardBody>
            <div className="stack" style={{ gap: ".5rem" }}>
              {data.leadTypes.map((t) => (
                <div key={t._id} className="row-b">
                  <span className="row" style={{ gap: ".45rem" }}>
                    {t.key === "exclusive" ? <Badge tone="gold">{t.name}</Badge> : <Badge tone="n">{t.name}</Badge>}
                    <span className="sm">{t.description}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="xs" style={{ marginTop: ".7rem" }}>
              &ldquo;I am not sure&rdquo; in the request wizard is recorded as undetermined and routed as life insurance, the prototype&apos;s default.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Coverage types"
          description="Products consumers can ask about and agents can choose to receive"
          actions={
            canManage && (
              <Button variant="out" size="s" icon="plus" onClick={() => setEditing({ kind: "coverage", row: null })}>
                Add
              </Button>
            )
          }
        />
        <DataTable
          flush
          caption="Coverage types"
          isEmpty={data.coverageTypes.length === 0}
          empty={<EmptyState icon="shield" title="No coverage types" />}
          columns={[{ label: "Coverage" }, { label: "Descriptions" }, { label: "TPMO" }, { label: "Status" }, { label: "Order", align: "right" }, { label: "Actions", align: "right", srOnly: true }]}
          footer={<CardFooter>{readOnlyNote || <span className="xs">Keys never change once created — leads and preferences reference them.</span>}</CardFooter>}
        >
          {data.coverageTypes.map((c) => (
            <tr key={c._id} style={c.active ? undefined : { opacity: 0.6 }}>
              <td>
                <span className="nm">{c.name}</span>
                <span className="tsub mono">{c.key}</span>
              </td>
              <td className="sm">
                {c.cardDescription || "—"}
                <span className="tsub">Wizard: {c.wizardDescription || "—"}</span>
              </td>
              <td>{c.requiresTpmo ? <Badge tone="b">Requires TPMO</Badge> : <span className="xs">—</span>}</td>
              <td>{c.active ? <Badge tone="g">Active</Badge> : <Badge tone="n">Inactive</Badge>}</td>
              <td className="tr sm">{c.sortOrder}</td>
              <td className="tr">
                {canManage && (
                  <Button variant="ghost" size="xs" onClick={() => setEditing({ kind: "coverage", row: c })} aria-label={`Edit ${c.name}`}>
                    Edit
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>

      <Card>
        <CardHeader
          title="Marketing sources"
          description="Where leads come from"
          actions={
            canManage && (
              <Button variant="out" size="s" icon="plus" onClick={() => setEditing({ kind: "source", row: null })}>
                Add
              </Button>
            )
          }
        />
        <CardBody style={{ paddingBottom: 0 }}>
          <Alert kind="w">
            <b>Only the sources evidenced so far are seeded</b> (website, Google Ads, Meta Lead Ads, partner API). The remaining sources are to be supplied by the
            client — add them here when confirmed (D8).
          </Alert>
        </CardBody>
        <div style={{ height: "1.25rem" }} />
        <DataTable
          flush
          caption="Marketing sources"
          isEmpty={data.marketingSources.length === 0}
          empty={<EmptyState icon="mega" title="No marketing sources" />}
          columns={[{ label: "Source" }, { label: "Channel" }, { label: "Default lead type" }, { label: "Status" }, { label: "Order", align: "right" }, { label: "Actions", align: "right", srOnly: true }]}
          footer={readOnlyNote ? <CardFooter>{readOnlyNote}</CardFooter> : undefined}
        >
          {data.marketingSources.map((s) => (
            <tr key={s._id} style={s.active ? undefined : { opacity: 0.6 }}>
              <td>
                <span className="nm">{s.name}</span>
                <span className="tsub mono">{s.key}</span>
              </td>
              <td className="sm">{s.channel}</td>
              <td>{s.defaultLeadType === "exclusive" ? <Badge tone="gold">Exclusive</Badge> : s.defaultLeadType === "standard" ? <Badge tone="n">Standard</Badge> : <span className="xs">Ratio</span>}</td>
              <td>{s.active ? <Badge tone="g">Active</Badge> : <Badge tone="n">Inactive</Badge>}</td>
              <td className="tr sm">{s.sortOrder}</td>
              <td className="tr">
                {canManage && (
                  <Button variant="ghost" size="xs" onClick={() => setEditing({ kind: "source", row: s })} aria-label={`Edit ${s.name}`}>
                    Edit
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>

      <div>
        <h2 className="h3" style={{ marginBottom: ".3rem" }}>
          Form options
        </h2>
        <p className="sm" style={{ marginBottom: "1rem" }}>
          Choices shown on the consumer request and agent application forms. Deactivating hides an option from new submissions; existing records keep their value.
        </p>
        <div className="g g2" style={{ alignItems: "start" }}>
          {FORM_OPTION_GROUPS.map((g) => {
            const rows = data.formOptions.filter((o) => o.group === g.group);
            return (
              <Card key={g.group}>
                <CardHeader
                  title={g.label}
                  description={g.help}
                  actions={
                    canManage && (
                      <Button variant="out" size="s" icon="plus" onClick={() => setEditing({ kind: "option", row: null, group: g.group })}>
                        Add
                      </Button>
                    )
                  }
                />
                <CardBody style={{ padding: ".5rem 1.25rem" }}>
                  {g.group === "budget_range" && (
                    <div style={{ margin: ".5rem 0" }}>
                      <Alert kind="w">Budget ranges are an assumption (D7). The client must confirm them before launch.</Alert>
                    </div>
                  )}
                  {rows.length === 0 ? (
                    <p className="sm" style={{ padding: ".6rem 0" }}>
                      No options yet.
                    </p>
                  ) : (
                    rows.map((o, i) => (
                      <div
                        key={o._id}
                        className={cn("row-b")}
                        style={{ padding: ".45rem 0", borderTop: i ? "1px solid var(--line)" : undefined, gap: ".5rem", flexWrap: "nowrap", opacity: o.active ? 1 : 0.6 }}
                      >
                        <span className="sm" style={{ color: "var(--ink)" }}>
                          {o.label} {!o.active && <Badge tone="n">Inactive</Badge>}
                        </span>
                        {canManage && (
                          <span className="b-row" style={{ flexWrap: "nowrap", gap: ".2rem" }}>
                            <Button variant="ghost" size="xs" onClick={() => setEditing({ kind: "option", row: o, group: g.group })}>
                              Edit<span className="sr-only"> {o.label}</span>
                            </Button>
                            <Button variant="ghost" size="xs" disabled={togglingOption} onClick={() => void toggleOption(o)}>
                              {o.active ? "Deactivate" : "Activate"}
                              <span className="sr-only"> {o.label}</span>
                            </Button>
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>

      {editing?.kind === "coverage" && <CoverageTypeModal row={editing.row} nextSortOrder={nextSort(data.coverageTypes)} onClose={() => setEditing(null)} />}
      {editing?.kind === "source" && <MarketingSourceModal row={editing.row} nextSortOrder={nextSort(data.marketingSources)} onClose={() => setEditing(null)} />}
      {editing?.kind === "option" && (
        <FormOptionModal
          row={editing.row}
          group={editing.group}
          nextSortOrder={nextSort(data.formOptions.filter((o) => o.group === editing.group))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
