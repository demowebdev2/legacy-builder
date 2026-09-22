"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UNSURE_COVERAGE_KEY } from "@/domain/referenceDefaults";

/** Prototype `.pickbox` quick-start form on the homepage hero. */
export function HeroQuickStart({
  coverage,
  states,
}: {
  coverage: Array<{ key: string; name: string }>;
  states: Array<{ code: string; name: string }>;
}) {
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [state, setState] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (product) params.set("coverage", product);
    if (state) params.set("state", state);
    router.push(`/request${params.size ? `?${params.toString()}` : ""}`);
  };

  return (
    <form className="pickbox" onSubmit={onSubmit}>
      <label htmlFor="hp">Tell us what coverage you are looking for</label>
      <div className="pickrow">
        <select id="hp" aria-label="Tell us what coverage you are looking for" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">Select coverage…</option>
          {coverage.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
          <option value={UNSURE_COVERAGE_KEY}>I am not sure yet</option>
        </select>
        <select aria-label="Your state" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Your state</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="b b-navy" type="submit">
          Get covered today
        </button>
      </div>
      <p className="picknote">Takes about two minutes. You choose whether to move forward — there is no obligation.</p>
    </form>
  );
}
