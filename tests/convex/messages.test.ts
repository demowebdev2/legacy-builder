import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../src/domain/reference";
import { as, createAccount, createLead, expectAppError, setupTest, teardownTest, type TestConvex } from "./fixtures";

const TOKEN = "consumer-token-abc123";

describe("lead chat", () => {
  let t: TestConvex;
  let accountId: Id<"accounts">;
  let agent: Awaited<ReturnType<typeof as>>;
  let leadId: Id<"leads">;
  let reference: string;
  let assignmentId: Id<"leadAssignments">;

  beforeEach(async () => {
    t = setupTest();
    const account = await createAccount(t);
    accountId = account.accountId;
    agent = await as(t, account.userId);
    leadId = await createLead(t, { confirmationTokenHash: await sha256Hex(TOKEN) });
    const seeded = await t.run(async (ctx) => {
      const lead = (await ctx.db.get(leadId))!;
      const id = await ctx.db.insert("leadAssignments", {
        leadId,
        accountId,
        leadType: "standard",
        method: "manual",
        assignedAt: Date.now(),
        status: "new",
        statusUpdatedAt: Date.now(),
        disputeDeadlineAt: Date.now() + 72 * 60 * 60 * 1000,
      });
      return { id, reference: lead.reference };
    });
    assignmentId = seeded.id;
    reference = seeded.reference;
  });
  afterEach(teardownTest);

  it("delivers messages both ways in one thread", async () => {
    await agent.mutation(api.messages.agentSend, { assignmentId, body: "Hi, happy to help." });
    await t.mutation(api.messages.consumerSend, { reference, token: TOKEN, assignmentId, body: "What does term cost?" });

    const agentView = await agent.query(api.messages.agentThread, { assignmentId });
    expect(agentView?.messages.map((m) => [m.fromAgent, m.body])).toEqual([
      [true, "Hi, happy to help."],
      [false, "What does term cost?"],
    ]);

    const threads = await t.query(api.messages.consumerThreads, { reference, token: TOKEN });
    expect(threads).toHaveLength(1);
    expect(threads?.[0].messages).toHaveLength(2);
  });

  it("refuses a consumer without the matching confirmation token", async () => {
    expect(await t.query(api.messages.consumerThreads, { reference, token: "wrong-token" })).toBeNull();
    await expectAppError(
      t.mutation(api.messages.consumerSend, { reference, token: "wrong-token", assignmentId, body: "hello" }),
      "NOT_FOUND",
    );
  });

  it("hides the thread from an agent who does not hold the assignment", async () => {
    const other = await createAccount(t);
    const stranger = await as(t, other.userId);
    expect(await stranger.query(api.messages.agentThread, { assignmentId })).toBeNull();
    await expectAppError(stranger.mutation(api.messages.agentSend, { assignmentId, body: "hello" }), "NOT_FOUND");
  });

  it("closes the thread once consent is withdrawn", async () => {
    await t.run(async (ctx) => ctx.db.patch(leadId, { withdrawnAt: Date.now() }));
    const view = await agent.query(api.messages.agentThread, { assignmentId });
    expect(view?.closed).toMatch(/consent was withdrawn/);
    await expectAppError(agent.mutation(api.messages.agentSend, { assignmentId, body: "still there?" }), "INVALID");
    await expectAppError(
      t.mutation(api.messages.consumerSend, { reference, token: TOKEN, assignmentId, body: "hi" }),
      "INVALID",
    );
  });

  it("rejects empty and oversized messages", async () => {
    await expectAppError(agent.mutation(api.messages.agentSend, { assignmentId, body: "   " }), "INVALID", /Type a message/);
    await expectAppError(agent.mutation(api.messages.agentSend, { assignmentId, body: "x".repeat(2001) }), "INVALID", /under 2000/);
  });
});
