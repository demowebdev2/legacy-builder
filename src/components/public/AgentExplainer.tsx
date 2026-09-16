import type { ReactNode } from "react";
import { DefinitionList } from "@/components/ui/Display";
import { MAX_PRODUCER_SEATS, PURCHASE_INCREMENT, PURCHASE_MINIMUM } from "@/domain/constants";
import { Reveal } from "./Reveal";

/**
 * Agent-facing explainer blocks shared by /pricing, /for-agents and /how-it-works (prototype `P.pricing`).
 * Copy follows decision D1: exclusive leads go to one agent; standard leads are shared with a small number.
 */

export const AGENT_STEPS: ReadonlyArray<readonly [string, string]> = [
  [
    "You pick the number",
    "Start at ten and move up in fives. There is no monthly cycle and nothing expires, so a quiet week costs you nothing.",
  ],
  [
    "We match automatically",
    "The engine checks your licensed states, your products and your daily pace, then releases each lead in turn — exclusive leads to one agent, standard leads to a small number. You do not chase or bid.",
  ],
  [
    "You only pay once",
    "One payment for the block. Working the leads costs nothing further, and seats for your producers are free.",
  ],
];

export const CONSUMER_STEPS: ReadonlyArray<readonly [string, string]> = [
  ["Answer a few short questions", "Product, location, what is bringing you here, contact details, consent. Two minutes."],
  ["We check who can help", "An agent licensed in your state, working your product, with room to take a new client that day."],
  ["A licensed agent contacts you", "Usually within a business day. Say the word and all contact stops."],
];

/** Prototype numbered explainer cards (`.card.card-p` + gold `.av` number). */
export function NumberedSteps({ steps, className = "g g3", headingLevel = 3 }: { steps: ReadonlyArray<readonly [string, ReactNode]>; className?: string; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={className}>
      {steps.map(([title, body], i) => (
        <Reveal key={title} index={i} className="card card-p">
          <div className="av" style={{ marginBottom: ".7rem" }} aria-hidden="true">
            {i + 1}
          </div>
          <H className="h4" style={{ marginBottom: ".3rem" }}>
            {title}
          </H>
          <p className="sm">{body}</p>
        </Reveal>
      ))}
    </div>
  );
}

/** Prototype "What you are buying" definition list. */
export function BuyingTerms({ disputeHours = 72 }: { disputeHours?: number }) {
  return (
    <DefinitionList
      items={[
        ["Minimum", `${PURCHASE_MINIMUM} leads, then steps of ${PURCHASE_INCREMENT}`],
        ["Mix", "Fixed at 2 exclusive per 10 — every +5 adds 1 exclusive and 4 standard"],
        [
          "Who else gets it",
          <>
            <b>Exclusive: nobody.</b> Released to you alone and never re-sold. <b>Standard:</b> shared with a small number of other licensed agents.
          </>,
        ],
        ["Delivery", "Automatic and one at a time, in turn, as matching consumers come in. Could be days, could be weeks."],
        [
          "Expiry",
          <>
            <b>None.</b> A quiet week costs you nothing.
          </>,
        ],
        ["Producer seats", `Included free, up to ${MAX_PRODUCER_SEATS}`],
        ["Disputes", `${disputeHours} hours — an upheld lead goes back into your balance`],
      ]}
    />
  );
}

export const EXCLUSIVE_BLURB = "From high-intent sources — someone who searched, came direct, or asked for a callback. Two in every ten, always.";
export const STANDARD_BLURB = "From our broader prospecting campaigns. Shared with a small number of other licensed agents.";
