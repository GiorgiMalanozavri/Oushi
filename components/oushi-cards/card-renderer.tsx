"use client";

import { motion } from "framer-motion";
import type { OushiCard } from "./types";
import { TimelineCardView } from "./timeline-card";
import { ChecklistCardView } from "./checklist-card";
import { PeopleCardView } from "./people-card";
import { ComparisonCardView } from "./comparison-card";
import { SummaryCardView } from "./summary-card";
import type { CardActionContext } from "./card-actions";

export function CardRenderer({
  card,
  index = 0,
  actionCtx,
}: {
  card: OushiCard;
  index?: number;
  actionCtx: CardActionContext;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="w-full"
    >
      {card.type === "timeline" && <TimelineCardView card={card} actionCtx={actionCtx} />}
      {card.type === "checklist" && <ChecklistCardView card={card} actionCtx={actionCtx} />}
      {card.type === "people" && <PeopleCardView card={card} actionCtx={actionCtx} />}
      {card.type === "comparison" && <ComparisonCardView card={card} />}
      {card.type === "summary" && <SummaryCardView card={card} />}
    </motion.div>
  );
}

export function CardStack({
  cards,
  actionCtx,
}: {
  cards: OushiCard[];
  actionCtx: CardActionContext;
}) {
  if (!cards || cards.length === 0) return null;
  return (
    <div className="space-y-3 mt-3">
      {cards.map((card, i) => (
        <CardRenderer key={i} card={card} index={i} actionCtx={actionCtx} />
      ))}
    </div>
  );
}
