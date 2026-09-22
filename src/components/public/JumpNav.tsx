"use client";

import { useEffect, useRef, useState } from "react";

/** Sticky in-page nav for the coverage options page. Highlights the section currently in view. */
export function JumpNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const targets = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => !!el);
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-160px 0px -70% 0px", threshold: 0 },
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    navRef.current?.querySelector(`button[data-id="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  return (
    <nav className="jump" aria-label="Jump to a coverage type" ref={navRef}>
      <div className="jump-in">
        <span className="jump-lb">Jump to</span>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-id={item.id}
            className={active === item.id ? "on" : undefined}
            onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" })}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
