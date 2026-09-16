import { Icon } from "@/components/ui/Icon";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

/** (new) FAQ accordion built from native <details> so it works without JavaScript and is keyboard accessible. */
export function FaqList({ items, openFirst }: { items: ReadonlyArray<FaqItem>; openFirst?: boolean }) {
  return (
    <div className="faq">
      {items.map((f, i) => (
        <details key={f.id} open={openFirst && i === 0}>
          <summary>
            <span>{f.question}</span>
            <Icon name="plus" />
          </summary>
          <p className="sm faq-a">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
