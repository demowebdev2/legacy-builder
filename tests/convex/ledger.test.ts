import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import * as ledgerModule from "../../convex/ledger";
import { computeBalanceFromLedger, creditLeads, debitLeads, type LedgerWrite, reverseLedgerEntry } from "../../convex/ledger";
import { SYSTEM_ACTOR } from "../../convex/lib/auth";
import { as, balanceOf, createAccount, expectAppError, ledgerOf, seedWorld, setupTest, teardownTest, type TestConvex, type World } from "./fixtures";

const write = (accountId: Id<"accounts">, overrides: Partial<LedgerWrite>): LedgerWrite => ({
  accountId,
  leadType: "standard",
  quantity: 1,
  entryType: "PURCHASE",
  reason: "test",
  source: "mock_payment",
  actor: SYSTEM_ACTOR,
  ...overrides,
});

describe("lead balance ledger", () => {
  let t: TestConvex;
  let world: World;
  let accountId: Id<"accounts">;

  beforeEach(async () => {
    t = setupTest();
    world = await seedWorld(t);
    ({ accountId } = await createAccount(t, { balance: {} }));
  });
  afterEach(teardownTest);

  it("credits and debits keep accountBalances equal to the sum of the ledger", async () => {
    await t.run(async (ctx) => {
      await creditLeads(ctx, write(accountId, { leadType: "exclusive", quantity: 6 }));
      await creditLeads(ctx, write(accountId, { leadType: "standard", quantity: 24 }));
      await debitLeads(ctx, write(accountId, { leadType: "standard", quantity: 1, entryType: "ASSIGNMENT", source: "engine" }));
      await debitLeads(ctx, write(accountId, { leadType: "exclusive", quantity: 2, entryType: "ADMIN_ADJUSTMENT", source: "admin" }));
      await creditLeads(ctx, write(accountId, { leadType: "standard", quantity: 1, entryType: "DISPUTE_RETURN", source: "admin" }));
    });

    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 4, standard: 24 });
    const fromLedger = await t.run((ctx) => computeBalanceFromLedger(ctx, accountId));
    expect(fromLedger).toEqual({ exclusive: 4, standard: 24, entries: 5 });

    const rows = await ledgerOf(t, accountId);
    expect(rows.map((r) => [r.entryType, r.leadType, r.direction, r.delta, r.balanceAfter])).toEqual([
      ["PURCHASE", "exclusive", "credit", 6, 6],
      ["PURCHASE", "standard", "credit", 24, 24],
      ["ASSIGNMENT", "standard", "debit", -1, 23],
      ["ADMIN_ADJUSTMENT", "exclusive", "debit", -2, 4],
      ["DISPUTE_RETURN", "standard", "credit", 1, 24],
    ]);

    const cache = await t.run(async (ctx) => ledgerModule.getBalanceDoc(ctx, accountId));
    expect(cache).toMatchObject({
      exclusivePurchased: 6,
      standardPurchased: 24,
      standardDelivered: 1,
      exclusiveIssued: 4, // 6 purchased − 2 removed by adjustment
      standardIssued: 25, // 24 purchased + 1 returned
    });

    const admin = await as(t, world.admin);
    expect(await admin.query(api.ledger.reconcile, { accountId })).toMatchObject({ inSync: true, cached: { exclusive: 4, standard: 24 } });
  });

  it("refuses to debit below zero with INSUFFICIENT_BALANCE and writes nothing", async () => {
    await t.run((ctx) => creditLeads(ctx, write(accountId, { leadType: "standard", quantity: 2 })));

    await expectAppError(
      t.run((ctx) => debitLeads(ctx, write(accountId, { leadType: "standard", quantity: 3, entryType: "ASSIGNMENT" }))),
      "INSUFFICIENT_BALANCE",
      /2 available, 3 required/,
    );
    // Exclusive balance is separate: standard leads cannot pay for an exclusive debit.
    await expectAppError(t.run((ctx) => debitLeads(ctx, write(accountId, { leadType: "exclusive", quantity: 1 }))), "INSUFFICIENT_BALANCE");

    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 0, standard: 2 });
    expect(await ledgerOf(t, accountId)).toHaveLength(1);
  });

  it("rolls back every write in the transaction when a later debit fails", async () => {
    await expectAppError(
      t.run(async (ctx) => {
        await creditLeads(ctx, write(accountId, { quantity: 5 }));
        await debitLeads(ctx, write(accountId, { quantity: 6, entryType: "ASSIGNMENT" }));
      }),
      "INSUFFICIENT_BALANCE",
    );
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 0, standard: 0 });
    expect(await ledgerOf(t, accountId)).toHaveLength(0);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects a ledger quantity of %s", async (quantity) => {
    await expectAppError(t.run((ctx) => creditLeads(ctx, write(accountId, { quantity }))), "INVALID");
  });

  it("a reversal adds a compensating row and never edits the original", async () => {
    const creditId = await t.run((ctx) => creditLeads(ctx, write(accountId, { leadType: "exclusive", quantity: 4 })));
    const original = await t.run((ctx) => ctx.db.get(creditId));

    const reversalId = await t.run((ctx) => reverseLedgerEntry(ctx, creditId, "Posted to the wrong account", SYSTEM_ACTOR));

    expect(await t.run((ctx) => ctx.db.get(creditId))).toEqual(original);
    const reversal = await t.run((ctx) => ctx.db.get(reversalId));
    expect(reversal).toMatchObject({
      entryType: "REVERSAL",
      direction: "debit",
      leadType: "exclusive",
      quantity: 4,
      delta: -4,
      balanceAfter: 0,
      reversesEntryId: creditId,
    });
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 0, standard: 0 });
    expect(await ledgerOf(t, accountId)).toHaveLength(2);

    await expectAppError(t.run((ctx) => reverseLedgerEntry(ctx, creditId, "again", SYSTEM_ACTOR)), "CONFLICT");
  });

  it("reversing a debit credits the leads back", async () => {
    await t.run((ctx) => creditLeads(ctx, write(accountId, { quantity: 3 })));
    const debitId = await t.run((ctx) => debitLeads(ctx, write(accountId, { quantity: 2, entryType: "ADMIN_ADJUSTMENT" })));
    await t.run((ctx) => reverseLedgerEntry(ctx, debitId, "Adjustment made in error", SYSTEM_ACTOR));
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 0, standard: 3 });
  });

  it("cannot reverse a credit that has already been spent (balance never goes negative)", async () => {
    const creditId = await t.run((ctx) => creditLeads(ctx, write(accountId, { quantity: 1 })));
    await t.run((ctx) => debitLeads(ctx, write(accountId, { quantity: 1, entryType: "ASSIGNMENT" })));
    await expectAppError(t.run((ctx) => reverseLedgerEntry(ctx, creditId, "too late", SYSTEM_ACTOR)), "INSUFFICIENT_BALANCE");
  });

  it("admin adjustment goes through the ledger, is audited and cannot overdraw", async () => {
    const finance = await as(t, world.finance);
    await finance.mutation(api.ledger.adjust, { accountId, leadType: "standard", direction: "credit", quantity: 5, reason: "Goodwill credit" });
    await expectAppError(
      finance.mutation(api.ledger.adjust, { accountId, leadType: "standard", direction: "debit", quantity: 6, reason: "Remove too many" }),
      "INSUFFICIENT_BALANCE",
    );
    await expectAppError(
      finance.mutation(api.ledger.adjust, { accountId, leadType: "standard", direction: "credit", quantity: 5, reason: "no" }),
      "INVALID",
    );
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 0, standard: 5 });
    const audits = await t.run((ctx) => ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "ledger.adjust")).collect());
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: world.finance, accountId });
  });

  it("exposes no update or delete API for ledger rows", () => {
    const exported = Object.keys(ledgerModule);
    expect(exported.filter((name) => /^(update|delete|remove|edit|patch|overwrite)/i.test(name))).toEqual([]);
  });
});
