"use client";

import { motion } from "framer-motion";
import { Mail, CheckCircle2, Shield, Sparkles, Inbox, Send, ArrowRight } from "lucide-react";

export function FloatingEmails() {
  const cards = [
    {
      id: 1,
      icon: <Sparkles className="w-5 h-5 text-claude-orange" />,
      title: "Project Update",
      desc: "Latest designs are ready for review.",
      top: "15%",
      left: "10%",
      delay: 0,
    },
    {
      id: 2,
      icon: <Shield className="w-5 h-5 text-success" />,
      title: "Security Alert",
      desc: "New login from Mac OS.",
      top: "45%",
      left: "5%",
      delay: 2,
    },
    {
      id: 3,
      icon: <Mail className="w-5 h-5 text-text-secondary" />,
      title: "Weekly Newsletter",
      desc: "Top 10 ways to optimize your workflow.",
      top: "20%",
      left: "75%",
      delay: 1,
    },
    {
      id: 4,
      icon: <CheckCircle2 className="w-5 h-5 text-success" />,
      title: "Payment Confirmed",
      desc: "Your subscription has been renewed.",
      top: "60%",
      left: "80%",
      delay: 3,
    },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {cards.map((card) => (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [20, 0, -20, -40],
            scale: [0.9, 1, 1, 0.9],
          }}
          transition={{
            duration: 8,
            delay: card.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute w-64 p-4 rounded-2xl bg-white/60 dark:bg-black/40 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.08)] flex items-start gap-4"
          style={{ top: card.top, left: card.left }}
        >
          <div className="p-2 rounded-xl bg-white/80 dark:bg-white/10 shadow-sm">
            {card.icon}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary dark:text-white/90">
              {card.title}
            </h4>
            <p className="text-xs text-text-secondary dark:text-white/60 mt-1 line-clamp-1">
              {card.desc}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
