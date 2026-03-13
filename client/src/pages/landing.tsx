import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, useInView, useAnimation, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import {
  Package,
  Truck,
  BarChart3,
  ShieldCheck,
  Zap,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Phone,
  Target,
  Brain,
  BookOpen,
  ChevronRight,
  Menu,
  X,
  ShoppingBag,
  Globe,
  TrendingUp,
  Users,
  MapPin,
  DollarSign,
  Bot,
  Megaphone,
  PhoneCall,
  Receipt,
  Store,
  Send,
  Sparkles,
  CircleDot,
  ArrowDown,
} from "lucide-react";

function useCountUp(end: number, duration = 2000, inView: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let startTime: number;
    let animFrame: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        animFrame = requestAnimationFrame(step);
      }
    };
    animFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrame);
  }, [end, duration, inView]);
  return count;
}

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" } },
};

function AnimatedSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const pipelineStages = [
  { label: "New", color: "bg-blue-500", icon: ShoppingBag },
  { label: "Confirmed", color: "bg-emerald-500", icon: CheckCircle2 },
  { label: "Booked", color: "bg-violet-500", icon: Package },
  { label: "Shipped", color: "bg-amber-500", icon: Truck },
  { label: "Delivered", color: "bg-green-600", icon: CheckCircle2 },
];

function OrderPipelineAnimation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const interval = setInterval(() => {
      setActiveStage((prev) => (prev + 1) % pipelineStages.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [isInView]);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {pipelineStages.map((stage, i) => {
          const Icon = stage.icon;
          const isActive = i <= activeStage;
          return (
            <div key={stage.label} className="flex items-center gap-1 sm:gap-2 flex-1">
              <motion.div
                animate={{
                  scale: i === activeStage ? 1.15 : 1,
                  opacity: isActive ? 1 : 0.4,
                }}
                transition={{ duration: 0.4 }}
                className={`flex flex-col items-center gap-1.5 flex-1`}
              >
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${isActive ? stage.color : "bg-muted"} flex items-center justify-center transition-colors duration-300`}>
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <span className={`text-[10px] sm:text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  {stage.label}
                </span>
              </motion.div>
              {i < pipelineStages.length - 1 && (
                <motion.div
                  animate={{ scaleX: i < activeStage ? 1 : 0, opacity: i < activeStage ? 1 : 0.3 }}
                  transition={{ duration: 0.5 }}
                  className="h-0.5 flex-1 bg-primary origin-left mb-5"
                />
              )}
            </div>
          );
        })}
      </div>
      <motion.div
        animate={{ opacity: isInView ? 1 : 0, y: isInView ? 0 : 10 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-6 space-y-2"
      >
        {[
          { order: "#1247", from: "Karachi", to: "Lahore", amount: "PKR 4,500", status: pipelineStages[activeStage].label },
          { order: "#1248", from: "Islamabad", to: "Peshawar", amount: "PKR 2,800", status: pipelineStages[Math.max(0, activeStage - 1)].label },
        ].map((item, i) => (
          <motion.div
            key={item.order}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.15 }}
            className="flex items-center justify-between p-3 rounded-lg border bg-background/80"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{item.order}</p>
                <p className="text-xs text-muted-foreground">{item.from} → {item.to}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{item.amount}</span>
              <Badge variant="secondary" className="text-[10px]">{item.status}</Badge>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function WhatsAppAnimation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const timers = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 1800),
      setTimeout(() => setStep(3), 3000),
      setTimeout(() => setStep(4), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  const messages = [
    { sender: "bot", text: "Assalam-o-Alaikum! Your order #1247 (PKR 4,500) is ready. Reply 1 to Confirm, 2 to Cancel.", delay: 0 },
    { sender: "user", text: "1", delay: 1 },
    { sender: "bot", text: "Order confirmed! Your parcel will be dispatched within 24 hours. Track: bit.ly/trk1247", delay: 2 },
  ];

  return (
    <div ref={ref} className="space-y-4">
      <div className="bg-[#075e54] dark:bg-[#1a3a34] rounded-t-xl p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-white text-sm font-medium">1SOL.AI Bot</p>
          <p className="text-white/60 text-xs">online</p>
        </div>
      </div>
      <div className="bg-[#ece5dd] dark:bg-muted/30 rounded-b-xl p-4 space-y-3 min-h-[200px]">
        <AnimatePresence>
          {messages.map((msg, i) =>
            step > i ? (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] p-2.5 rounded-lg text-sm ${
                  msg.sender === "user"
                    ? "bg-[#dcf8c6] dark:bg-emerald-900/50 text-foreground"
                    : "bg-white dark:bg-muted text-foreground"
                }`}>
                  {msg.text}
                </div>
              </motion.div>
            ) : null
          )}
        </AnimatePresence>
        {step >= 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex justify-center"
          >
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Auto-confirmed
            </Badge>
          </motion.div>
        )}
      </div>
      {step >= 4 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
        >
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <PhoneCall className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">RoboCall Backup</p>
            <p className="text-xs text-muted-foreground">No reply? Auto-dial customer with IVR confirmation</p>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                animate={{ scaleY: [0.3, 1, 0.3] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                className="w-1 h-6 bg-amber-500 rounded-full"
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function CourierTrackingAnimation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const couriers = [
    { name: "Leopards", color: "bg-orange-500", initial: "L" },
    { name: "PostEx", color: "bg-blue-600", initial: "P" },
    { name: "TCS", color: "bg-red-600", initial: "T" },
    { name: "M&P", color: "bg-purple-600", initial: "M" },
    { name: "Trax", color: "bg-teal-600", initial: "X" },
  ];

  return (
    <div ref={ref} className="relative">
      <div className="grid grid-cols-5 gap-3 mb-6">
        {couriers.map((c, i) => (
          <motion.div
            key={c.name}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.12, duration: 0.4 }}
            className="flex flex-col items-center gap-2"
          >
            <div className={`w-12 h-12 rounded-xl ${c.color} flex items-center justify-center text-white font-bold text-lg`}>
              {c.initial}
            </div>
            <span className="text-xs font-medium text-muted-foreground">{c.name}</span>
          </motion.div>
        ))}
      </div>
      {isInView && (
        <motion.div
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="origin-top"
        >
          <div className="flex items-center justify-center gap-2 mb-4">
            {couriers.map((_, i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                className="w-8 h-0.5 bg-primary"
              />
            ))}
          </div>
          <div className="border rounded-lg p-4 bg-background">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Unified Tracking Dashboard</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "In Transit", value: "124", color: "text-amber-600" },
                { label: "Delivered", value: "892", color: "text-green-600" },
                { label: "Returns", value: "31", color: "text-red-500" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 + i * 0.15 }}
                  className="text-center p-2 rounded-md bg-muted/50"
                >
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function MetaAdsAnimation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const timers = [
      setTimeout(() => setStep(1), 500),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2000),
      setTimeout(() => setStep(4), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  const stages = [
    { icon: Target, label: "Targeting", desc: "Karachi, Lahore, Islamabad" },
    { icon: Megaphone, label: "Creative", desc: "Product images + copy" },
    { icon: Send, label: "Launch", desc: "Facebook + Instagram" },
    { icon: TrendingUp, label: "Results", desc: "ROAS 3.2x" },
  ];

  return (
    <div ref={ref} className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const isActive = step > i;
          return (
            <motion.div
              key={s.label}
              animate={{ opacity: isActive ? 1 : 0.3, scale: step === i + 1 ? 1.05 : 1 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center mb-1.5 ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-medium">{s.label}</p>
            </motion.div>
          );
        })}
      </div>
      {step >= 4 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border rounded-lg p-4 bg-background"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Campaign Performance</span>
            <Badge variant="secondary" className="text-[10px]">Live</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Spend", value: "PKR 15K" },
              { label: "Orders", value: "47" },
              { label: "ROAS", value: "3.2x" },
            ].map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="text-center p-2 rounded bg-muted/50"
              >
                <p className="text-sm font-bold text-primary">{m.value}</p>
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function AIAnimation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [visibleMessages, setVisibleMessages] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const timers = [
      setTimeout(() => setVisibleMessages(1), 400),
      setTimeout(() => setVisibleMessages(2), 1400),
      setTimeout(() => setVisibleMessages(3), 2600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  const chatMessages = [
    { role: "user", text: "What's my best performing city this week?" },
    { role: "ai", text: "Lahore leads with 156 orders (32% of total), 94% delivery rate, and PKR 2.1M revenue. Karachi follows at 128 orders." },
    { role: "user", text: "Suggest how to reduce returns" },
  ];

  return (
    <div ref={ref} className="space-y-3">
      <div className="flex items-center gap-2 p-3 rounded-t-xl bg-primary/5 border border-b-0">
        <Bot className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium">AI Business Assistant</span>
        <Sparkles className="w-3 h-3 text-primary ml-auto" />
      </div>
      <div className="border rounded-b-xl p-4 space-y-3 min-h-[160px]">
        {chatMessages.map((msg, i) =>
          visibleMessages > i ? (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[85%] p-2.5 rounded-lg text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}>
                {msg.text}
              </div>
            </motion.div>
          ) : null
        )}
        {visibleMessages >= 3 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-1 pl-2"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                className="w-2 h-2 rounded-full bg-primary"
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function AccountingAnimation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const timers = [
      setTimeout(() => setStep(1), 400),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  return (
    <div ref={ref} className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "COD Collected", value: "PKR 485K", icon: DollarSign, color: "text-green-600" },
          { label: "Courier Fees", value: "PKR 14.5K", icon: Truck, color: "text-amber-600" },
          { label: "Net Receivable", value: "PKR 470K", icon: Receipt, color: "text-primary" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            animate={{ opacity: step > 0 ? 1 : 0.3, y: step > 0 ? 0 : 10 }}
            transition={{ delay: i * 0.15, duration: 0.4 }}
            className="p-3 rounded-lg border bg-background text-center"
          >
            <item.icon className={`w-5 h-5 mx-auto mb-1 ${item.color}`} />
            <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
            <p className="text-[10px] text-muted-foreground">{item.label}</p>
          </motion.div>
        ))}
      </div>
      {step >= 2 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.4 }}
          className="space-y-2"
        >
          {[
            { courier: "Leopards", amount: "PKR 185K", status: "Reconciled", statusColor: "text-green-600" },
            { courier: "PostEx", amount: "PKR 220K", status: "Pending", statusColor: "text-amber-600" },
            { courier: "TCS", amount: "PKR 80K", status: "Reconciled", statusColor: "text-green-600" },
          ].map((row, i) => (
            <motion.div
              key={row.courier}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center justify-between p-2.5 rounded border bg-background/80"
            >
              <span className="text-sm font-medium">{row.courier}</span>
              <span className="text-sm">{row.amount}</span>
              <span className={`text-xs font-medium ${row.statusColor}`}>{row.status}</span>
            </motion.div>
          ))}
        </motion.div>
      )}
      {step >= 3 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
        >
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">P&L Report Generated</p>
            <p className="text-xs text-green-600/70 dark:text-green-400/70">Revenue: PKR 2.1M | Profit: PKR 485K | Margin: 23%</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

const integrations = [
  { name: "Shopify", color: "bg-[#96bf48]", icon: Store },
  { name: "WhatsApp", color: "bg-[#25d366]", icon: MessageSquare },
  { name: "Meta Ads", color: "bg-[#1877f2]", icon: Megaphone },
  { name: "Leopards", color: "bg-orange-500", icon: Truck },
  { name: "PostEx", color: "bg-blue-600", icon: Package },
  { name: "TCS", color: "bg-red-600", icon: Truck },
  { name: "OpenAI", color: "bg-[#10a37f]", icon: Brain },
  { name: "Resend", color: "bg-[#000]", icon: Send },
];

function IntegrationSlider() {
  const [isPaused, setIsPaused] = useState(false);

  return (
    <div
      className="overflow-hidden py-8"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className="flex gap-8 w-max"
        style={{
          animation: "slider-scroll 25s linear infinite",
          animationPlayState: isPaused ? "paused" : "running",
        }}
      >
        {[...integrations, ...integrations].map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={`${item.name}-${i}`}
              className="flex items-center gap-3 px-6 py-3 rounded-xl border bg-background hover:border-primary/30 transition-colors group cursor-default"
            >
              <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-sm whitespace-nowrap group-hover:text-primary transition-colors">{item.name}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes slider-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

const flowSteps = [
  { icon: Store, label: "Connect Store", desc: "Shopify OAuth" },
  { icon: Package, label: "Sync Orders", desc: "Auto-import" },
  { icon: MessageSquare, label: "Confirm", desc: "WhatsApp + RoboCall" },
  { icon: Truck, label: "Book Courier", desc: "Multi-carrier" },
  { icon: MapPin, label: "Track", desc: "Real-time" },
  { icon: CheckCircle2, label: "Deliver", desc: "POD capture" },
  { icon: DollarSign, label: "Reconcile", desc: "COD matching" },
  { icon: Brain, label: "Analyze", desc: "AI insights" },
];

function VisualFlowChart() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <div ref={ref} className="relative">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
        {flowSteps.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.12, duration: 0.4 }}
              className="relative group"
            >
              <div className="flex flex-col items-center text-center p-4 rounded-xl border bg-background hover:border-primary/40 transition-all">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <span className="text-xs font-semibold mb-0.5">{step.label}</span>
                <span className="text-[10px] text-muted-foreground">{step.desc}</span>
                <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
                  {i + 1}
                </div>
              </div>
              {i < flowSteps.length - 1 && i % 4 !== 3 && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={isInView ? { scaleX: 1 } : {}}
                  transition={{ delay: i * 0.12 + 0.3, duration: 0.3 }}
                  className="hidden sm:block absolute top-1/2 -right-3 sm:-right-4 w-4 sm:w-6 h-0.5 bg-primary/30 origin-left"
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

const featureSections = [
  {
    id: "orders",
    badge: "Order Management",
    title: "Complete Order Pipeline",
    description: "From Shopify sync to delivery confirmation — manage every order through a visual pipeline with real-time status updates across all stages.",
    animation: OrderPipelineAnimation,
    reverse: false,
  },
  {
    id: "whatsapp",
    badge: "WhatsApp + RoboCall",
    title: "Automated Confirmation",
    description: "Confirm orders instantly via WhatsApp messages. If no reply, the system auto-triggers robocalls with IVR for confirmation — reducing fake orders by up to 40%.",
    animation: WhatsAppAnimation,
    reverse: true,
  },
  {
    id: "couriers",
    badge: "Multi-Courier",
    title: "Unified Courier Tracking",
    description: "Connect Leopards, PostEx, TCS, M&P and more. Track all shipments from a single dashboard with real-time status sync and bulk booking.",
    animation: CourierTrackingAnimation,
    reverse: false,
  },
  {
    id: "ads",
    badge: "Meta Ads",
    title: "Launch & Manage Ads",
    description: "Create Facebook and Instagram campaigns directly from 1SOL. Target Pakistani cities, upload creatives, launch ads, and track ROAS — all in one place.",
    animation: MetaAdsAnimation,
    reverse: true,
  },
  {
    id: "ai",
    badge: "AI Integration",
    title: "AI-Powered Insights",
    description: "Ask questions about your business and get instant answers. AI analyzes orders, revenue, returns, courier performance, and more to give you actionable insights.",
    animation: AIAnimation,
    reverse: false,
  },
  {
    id: "accounting",
    badge: "Accounting & COD",
    title: "Financial Reconciliation",
    description: "Track COD collections, reconcile courier payments, manage expenses, and generate P&L reports. Complete double-entry accounting built for e-commerce.",
    animation: AccountingAnimation,
    reverse: true,
  },
];

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true });

  const ordersCount = useCountUp(50000, 2000, statsInView);
  const merchantsCount = useCountUp(500, 1800, statsInView);
  const citiesCount = useCountUp(45, 1500, statsInView);
  const deliveryRate = useCountUp(94, 1600, statsInView);

  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-xl">1SOL.AI</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium" data-testid="link-features">
                Features
              </a>
              <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium" data-testid="link-how-it-works">
                How it Works
              </a>
              <Link href="/pricing">
                <span className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium cursor-pointer" data-testid="link-pricing">
                  Pricing
                </span>
              </Link>
              <Link href="/contact">
                <span className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium cursor-pointer" data-testid="link-contact">
                  Contact
                </span>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <a href="/api/login">
                <Button data-testid="button-login" size="sm">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
              <button
                className="md:hidden p-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                data-testid="button-mobile-menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden border-t bg-background overflow-hidden"
            >
              <div className="px-4 py-4 space-y-3">
                <a href="#features" className="block text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Features</a>
                <a href="#how-it-works" className="block text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
                <Link href="/pricing"><span className="block text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setMobileMenuOpen(false)}>Pricing</span></Link>
                <Link href="/contact"><span className="block text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setMobileMenuOpen(false)}>Contact</span></Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <section className="pt-28 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7 }}
              className="space-y-8"
            >
              <div className="space-y-5">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Badge variant="secondary" className="px-4 py-1.5">
                    <Zap className="w-3 h-3 mr-1" />
                    Built for Pakistani Merchants
                  </Badge>
                </motion.div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
                  <motion.span
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="block"
                  >
                    Your Complete
                  </motion.span>
                  <motion.span
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45, duration: 0.6 }}
                    className="block text-primary"
                  >
                    E-Commerce OS
                  </motion.span>
                </h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-lg text-muted-foreground max-w-xl"
                >
                  Orders, couriers, WhatsApp confirmations, Meta Ads, AI insights, and accounting — all unified in one platform designed for Shopify merchants in Pakistan.
                </motion.p>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <a href="/api/login">
                  <Button size="lg" className="w-full sm:w-auto" data-testid="button-hero-cta">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </a>
                <a href="#features">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="button-explore">
                    Explore Features
                    <ArrowDown className="w-4 h-4 ml-2" />
                  </Button>
                </a>
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Free forever plan</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Setup in 5 minutes</span>
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="relative"
            >
              <Card className="relative border overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-muted/30 p-3 border-b flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">1SOL.AI Dashboard</span>
                  </div>
                  <div className="p-6">
                    <OrderPipelineAnimation />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      <section ref={statsRef} className="py-12 border-y bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: "Orders Processed", value: ordersCount, suffix: "+", icon: Package },
              { label: "Active Merchants", value: merchantsCount, suffix: "+", icon: Users },
              { label: "Cities Covered", value: citiesCount, suffix: "", icon: MapPin },
              { label: "Delivery Rate", value: deliveryRate, suffix: "%", icon: TrendingUp },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  variants={fadeUp}
                  className="text-center"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Icon className="w-5 h-5 text-primary" />
                    <span className="text-3xl sm:text-4xl font-bold text-primary">
                      {stat.value.toLocaleString()}{stat.suffix}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16 sm:mb-20">
            <motion.div variants={fadeUp}>
              <Badge variant="outline" className="mb-4">Platform Features</Badge>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Everything Your Business Needs
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground max-w-2xl mx-auto text-lg">
              A complete operating system for e-commerce logistics — from first order to final reconciliation.
            </motion.p>
          </AnimatedSection>

          <div className="space-y-24 sm:space-y-32">
            {featureSections.map((section) => {
              const Animation = section.animation;
              return (
                <AnimatedSection key={section.id}>
                  <div className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center ${section.reverse ? "lg:direction-rtl" : ""}`}>
                    <motion.div
                      variants={fadeUp}
                      className={`space-y-6 ${section.reverse ? "lg:order-2" : ""}`}
                    >
                      <Badge variant="secondary">{section.badge}</Badge>
                      <h3 className="text-2xl sm:text-3xl font-bold">{section.title}</h3>
                      <p className="text-muted-foreground leading-relaxed">{section.description}</p>
                      <a href="/api/login">
                        <Button variant="outline" className="group" data-testid={`button-feature-${section.id}`}>
                          Learn More
                          <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                        </Button>
                      </a>
                    </motion.div>
                    <motion.div
                      variants={scaleIn}
                      className={`${section.reverse ? "lg:order-1" : ""}`}
                    >
                      <Card className="border">
                        <CardContent className="p-6">
                          <Animation />
                        </CardContent>
                      </Card>
                    </motion.div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/20 border-y">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-8">
            <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-bold mb-3">
              Integrations That Power Your Business
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground">
              Seamlessly connected with the tools you already use
            </motion.p>
          </AnimatedSection>
          <IntegrationSlider />
        </div>
      </section>

      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeUp}>
              <Badge variant="outline" className="mb-4">How It Works</Badge>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4">
              Your Complete E-Commerce Journey
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground max-w-2xl mx-auto">
              From connecting your store to AI-powered analytics — every step automated and optimized.
            </motion.p>
          </AnimatedSection>
          <VisualFlowChart />
        </div>
      </section>

      <section className="py-20 bg-primary relative overflow-hidden">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-24 -right-24 w-64 h-64 rounded-full border border-primary-foreground/10"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full border border-primary-foreground/10"
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4"
          >
            Ready to Transform Your Operations?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-primary-foreground/80 mb-8 max-w-2xl mx-auto text-lg"
          >
            Join hundreds of Pakistani merchants who have streamlined their logistics with 1SOL.AI.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <a href="/api/login">
              <Button size="lg" variant="secondary" data-testid="button-cta-bottom">
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-cta-pricing">
                View Pricing
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="py-16 border-t bg-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-xl">1SOL.AI</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The complete e-commerce operating system for Pakistani merchants.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Product</h4>
              <div className="space-y-2">
                <a href="#features" className="block text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-features">Features</a>
                <Link href="/pricing"><span className="block text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-footer-pricing">Pricing</span></Link>
                <a href="#how-it-works" className="block text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-how-it-works">How it Works</a>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Company</h4>
              <div className="space-y-2">
                <Link href="/contact"><span className="block text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-footer-contact">Contact</span></Link>
                <a href="/api/login" className="block text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-login">Sign In</a>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Legal</h4>
              <div className="space-y-2">
                <Link href="/privacy-policy"><span className="block text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-footer-privacy">Privacy Policy</span></Link>
                <Link href="/terms-of-service"><span className="block text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-footer-terms">Terms of Service</span></Link>
                <Link href="/data-deletion"><span className="block text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-footer-data-deletion">Data Deletion</span></Link>
              </div>
            </div>
          </div>
          <div className="pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} 1SOL.AI. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
