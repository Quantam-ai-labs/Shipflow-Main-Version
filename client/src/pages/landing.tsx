import { useState, useEffect, useRef } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  Package,
  Truck,
  Zap,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Target,
  Brain,
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
  ArrowDown,
} from "lucide-react";
import { SiWhatsapp, SiInstagram, SiX } from "react-icons/si";

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

function StarField() {
  const stars = useRef<{ x: number; y: number; r: number; opacity: number; speed: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    stars.current = Array.from({ length: 120 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.2 + 0.3,
      opacity: Math.random() * 0.6 + 0.1,
      speed: Math.random() * 0.015 + 0.005,
    }));

    let time = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 1;
      stars.current.forEach((star) => {
        const twinkle = star.opacity + Math.sin(time * star.speed * 3) * 0.25;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0.05, Math.min(0.85, twinkle))})`;
        ctx.fill();
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
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
                  opacity: isActive ? 1 : 0.35,
                }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center gap-1.5 flex-1"
              >
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${isActive ? stage.color : "bg-white/10"} flex items-center justify-center transition-colors duration-300`}>
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <span className={`text-[10px] sm:text-xs font-medium ${isActive ? "text-white" : "text-white/40"}`}>
                  {stage.label}
                </span>
              </motion.div>
              {i < pipelineStages.length - 1 && (
                <motion.div
                  animate={{ scaleX: i < activeStage ? 1 : 0, opacity: i < activeStage ? 1 : 0.2 }}
                  transition={{ duration: 0.5 }}
                  className="h-0.5 flex-1 bg-emerald-400 origin-left mb-5"
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
            className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Package className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{item.order}</p>
                <p className="text-xs text-white/50">{item.from} → {item.to}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/50">{item.amount}</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">{item.status}</span>
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
      <div className="bg-[#075e54] rounded-t-xl p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-white text-sm font-medium">1SOL.AI Bot</p>
          <p className="text-white/60 text-xs">online</p>
        </div>
      </div>
      <div className="bg-[#1a1a2e] rounded-b-xl p-4 space-y-3 min-h-[200px]">
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
                    ? "bg-emerald-600/80 text-white"
                    : "bg-white/10 text-white/90"
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
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-3 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Auto-confirmed
            </span>
          </motion.div>
        )}
      </div>
      {step >= 4 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/10"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <PhoneCall className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">RoboCall Backup</p>
            <p className="text-xs text-white/50">No reply? Auto-dial customer with IVR confirmation</p>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                animate={{ scaleY: [0.3, 1, 0.3] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                className="w-1 h-6 bg-amber-400 rounded-full"
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
            <span className="text-xs font-medium text-white/50">{c.name}</span>
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
                className="w-8 h-0.5 bg-violet-400"
              />
            ))}
          </div>
          <div className="rounded-lg p-4 bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium text-white">Unified Tracking Dashboard</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "In Transit", value: "124", color: "text-amber-400" },
                { label: "Delivered", value: "892", color: "text-emerald-400" },
                { label: "Returns", value: "31", color: "text-red-400" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 + i * 0.15 }}
                  className="text-center p-2 rounded-md bg-white/5"
                >
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-[10px] text-white/40">{stat.label}</p>
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
              <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center mb-1.5 ${isActive ? "bg-violet-500 text-white" : "bg-white/10 text-white/40"}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-medium text-white/70">{s.label}</p>
            </motion.div>
          );
        })}
      </div>
      {step >= 4 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg p-4 bg-white/5 border border-white/10"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-white">Campaign Performance</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">Live</span>
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
                className="text-center p-2 rounded bg-white/5"
              >
                <p className="text-sm font-bold text-violet-300">{m.value}</p>
                <p className="text-[10px] text-white/40">{m.label}</p>
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
      <div className="flex items-center gap-2 p-3 rounded-t-xl bg-violet-500/10 border border-violet-500/20 border-b-0">
        <Bot className="w-5 h-5 text-violet-400" />
        <span className="text-sm font-medium text-white">AI Business Assistant</span>
        <Sparkles className="w-3 h-3 text-violet-400 ml-auto" />
      </div>
      <div className="border border-violet-500/20 rounded-b-xl p-4 space-y-3 min-h-[160px] bg-white/5">
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
                  ? "bg-violet-600 text-white"
                  : "bg-white/10 text-white/90"
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
                className="w-2 h-2 rounded-full bg-violet-400"
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
          { label: "COD Collected", value: "PKR 485K", icon: DollarSign, color: "text-emerald-400" },
          { label: "Courier Fees", value: "PKR 14.5K", icon: Truck, color: "text-amber-400" },
          { label: "Net Receivable", value: "PKR 470K", icon: Receipt, color: "text-violet-400" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            animate={{ opacity: step > 0 ? 1 : 0.3, y: step > 0 ? 0 : 10 }}
            transition={{ delay: i * 0.15, duration: 0.4 }}
            className="p-3 rounded-lg border border-white/10 bg-white/5 text-center"
          >
            <item.icon className={`w-5 h-5 mx-auto mb-1 ${item.color}`} />
            <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
            <p className="text-[10px] text-white/40">{item.label}</p>
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
            { courier: "Leopards", amount: "PKR 185K", status: "Reconciled", statusColor: "text-emerald-400" },
            { courier: "PostEx", amount: "PKR 220K", status: "Pending", statusColor: "text-amber-400" },
            { courier: "TCS", amount: "PKR 80K", status: "Reconciled", statusColor: "text-emerald-400" },
          ].map((row, i) => (
            <motion.div
              key={row.courier}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center justify-between p-2.5 rounded border border-white/10 bg-white/5"
            >
              <span className="text-sm font-medium text-white">{row.courier}</span>
              <span className="text-sm text-white/60">{row.amount}</span>
              <span className={`text-xs font-medium ${row.statusColor}`}>{row.status}</span>
            </motion.div>
          ))}
        </motion.div>
      )}
      {step >= 3 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-300">P&L Report Generated</p>
            <p className="text-xs text-emerald-400/70">Revenue: PKR 2.1M | Profit: PKR 485K | Margin: 23%</p>
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
  { name: "Resend", color: "bg-slate-700", icon: Send },
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
              className="flex items-center gap-3 px-6 py-3 rounded-xl border border-white/10 bg-white/5 hover:border-violet-500/40 hover:bg-white/8 transition-colors group cursor-default"
            >
              <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-sm whitespace-nowrap text-white/80 group-hover:text-white transition-colors">{item.name}</span>
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
              <div className="flex flex-col items-center text-center p-4 rounded-xl border border-white/10 bg-white/5 hover:border-violet-500/40 hover:bg-white/8 transition-all">
                <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-3 group-hover:bg-violet-500/25 transition-colors">
                  <Icon className="w-6 h-6 text-violet-400" />
                </div>
                <span className="text-xs font-semibold mb-0.5 text-white">{step.label}</span>
                <span className="text-[10px] text-white/40">{step.desc}</span>
                <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {i + 1}
                </div>
              </div>
              {i < flowSteps.length - 1 && i % 4 !== 3 && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={isInView ? { scaleX: 1 } : {}}
                  transition={{ delay: i * 0.12 + 0.3, duration: 0.3 }}
                  className="hidden sm:block absolute top-1/2 -right-3 sm:-right-4 w-4 sm:w-6 h-0.5 bg-violet-500/30 origin-left"
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
    accent: "from-emerald-500/20 to-teal-500/5",
  },
  {
    id: "whatsapp",
    badge: "WhatsApp + RoboCall",
    title: "Automated Confirmation",
    description: "Confirm orders instantly via WhatsApp messages. If no reply, the system auto-triggers robocalls with IVR for confirmation — reducing fake orders by up to 40%.",
    animation: WhatsAppAnimation,
    reverse: true,
    accent: "from-green-500/20 to-emerald-500/5",
  },
  {
    id: "couriers",
    badge: "Multi-Courier",
    title: "Unified Courier Tracking",
    description: "Connect Leopards, PostEx, TCS, M&P and more. Track all shipments from a single dashboard with real-time status sync and bulk booking.",
    animation: CourierTrackingAnimation,
    reverse: false,
    accent: "from-violet-500/20 to-purple-500/5",
  },
  {
    id: "ads",
    badge: "Meta Ads",
    title: "Launch & Manage Ads",
    description: "Create Facebook and Instagram campaigns directly from 1SOL. Target Pakistani cities, upload creatives, launch ads, and track ROAS — all in one place.",
    animation: MetaAdsAnimation,
    reverse: true,
    accent: "from-blue-500/20 to-indigo-500/5",
  },
  {
    id: "ai",
    badge: "AI Integration",
    title: "AI-Powered Insights",
    description: "Ask questions about your business and get instant answers. AI analyzes orders, revenue, returns, courier performance, and more to give you actionable insights.",
    animation: AIAnimation,
    reverse: false,
    accent: "from-purple-500/20 to-violet-500/5",
  },
  {
    id: "accounting",
    badge: "Accounting & COD",
    title: "Financial Reconciliation",
    description: "Track COD collections, reconcile courier payments, manage expenses, and generate P&L reports. Complete double-entry accounting built for e-commerce.",
    animation: AccountingAnimation,
    reverse: true,
    accent: "from-pink-500/20 to-rose-500/5",
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
    <div
      className="min-h-screen"
      style={{ background: "#08080f", color: "#fff" }}
      data-testid="landing-page"
    >
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/8 bg-[#08080f]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
                <div className="w-8 h-8 rounded-md bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl text-white">1SOL.AI</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-white/50 hover:text-white transition-colors text-sm font-medium" data-testid="link-features">
                Features
              </a>
              <a href="#how-it-works" className="text-white/50 hover:text-white transition-colors text-sm font-medium" data-testid="link-how-it-works">
                How it Works
              </a>
              <Link href="/pricing">
                <span className="text-white/50 hover:text-white transition-colors text-sm font-medium cursor-pointer" data-testid="link-pricing">
                  Pricing
                </span>
              </Link>
              <Link href="/contact">
                <span className="text-white/50 hover:text-white transition-colors text-sm font-medium cursor-pointer" data-testid="link-contact">
                  Contact
                </span>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <a href="/auth" className="hidden md:block">
                <button
                  data-testid="button-login"
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-600 to-emerald-500 text-white hover:opacity-90 transition-opacity"
                >
                  Get Started
                </button>
              </a>
              <button
                className="md:hidden p-2 text-white/70 hover:text-white"
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
              className="md:hidden border-t border-white/8 bg-[#0d0d1a] overflow-hidden"
            >
              <div className="px-4 py-4 space-y-3">
                <a href="#features" className="block text-sm font-medium text-white/60 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Features</a>
                <a href="#how-it-works" className="block text-sm font-medium text-white/60 hover:text-white" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
                <Link href="/pricing"><span className="block text-sm font-medium text-white/60 hover:text-white cursor-pointer" onClick={() => setMobileMenuOpen(false)}>Pricing</span></Link>
                <Link href="/contact"><span className="block text-sm font-medium text-white/60 hover:text-white cursor-pointer" onClick={() => setMobileMenuOpen(false)}>Contact</span></Link>
                <a href="/auth" className="block">
                  <button className="w-full mt-2 px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-600 to-emerald-500 text-white">
                    Get Started
                  </button>
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-28 sm:pt-36 pb-20 sm:pb-28 px-4 sm:px-6 lg:px-8 overflow-hidden min-h-screen flex flex-col justify-center">
        <StarField />

        {/* Aurora orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[90vw] h-[50vh] rounded-full blur-[140px] opacity-30"
            style={{ background: "radial-gradient(ellipse, #4f46e5 0%, #10b981 40%, transparent 70%)" }}
          />
          <div
            className="absolute bottom-[-5%] left-[20%] w-[40vw] h-[30vh] rounded-full blur-[100px] opacity-20"
            style={{ background: "radial-gradient(ellipse, #ec4899 0%, transparent 70%)" }}
          />
          <div
            className="absolute bottom-[-5%] right-[15%] w-[35vw] h-[25vh] rounded-full blur-[100px] opacity-20"
            style={{ background: "radial-gradient(ellipse, #f59e0b 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6 inline-block"
            >
              <span className="px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm font-medium flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" />
                Built for Pakistani E-Commerce Merchants
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.7 }}
              className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-6"
            >
              <span className="text-white">One platform to run</span>
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(90deg, #a78bfa 0%, #34d399 60%, #f59e0b 100%)" }}
              >
                your entire operation
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-lg sm:text-xl text-white/55 max-w-2xl mx-auto mb-10"
            >
              Orders, couriers, WhatsApp confirmations, Meta Ads, AI insights, and accounting — all unified in one powerful platform.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mb-10"
            >
              <a href="/auth">
                <button
                  data-testid="button-hero-cta"
                  className="px-7 py-3.5 rounded-full text-base font-semibold bg-gradient-to-r from-violet-600 to-emerald-500 text-white hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4" />
                </button>
              </a>
              <a href="#features">
                <button
                  data-testid="button-explore"
                  className="px-7 py-3.5 rounded-full text-base font-semibold border border-white/15 bg-white/5 text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                  Explore Features
                  <ArrowDown className="w-4 h-4" />
                </button>
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/40"
            >
              {["Free forever plan", "No credit card required", "Setup in 5 minutes"].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{t}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Floating glass cards */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto"
          >
            {/* Order card */}
            <div
              className="rounded-2xl border border-white/10 p-5 relative overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(16px)" }}
            >
              <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(79,70,229,0.15) 0%, transparent 60%)" }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <Package className="w-4 h-4 text-violet-400" />
                  </div>
                  <span className="text-sm font-semibold text-white">Order Pipeline</span>
                  <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full">Live</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">1,247</div>
                <div className="text-xs text-white/40">Active orders today</div>
                <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "72%" }}
                    transition={{ delay: 1.2, duration: 1 }}
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400"
                  />
                </div>
                <div className="text-[10px] text-white/30 mt-1">72% delivered</div>
              </div>
            </div>

            {/* WhatsApp confirmation badge */}
            <div
              className="rounded-2xl border border-white/10 p-5 relative overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(16px)" }}
            >
              <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.15) 0%, transparent 60%)" }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-white">WhatsApp Bot</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">94%</div>
                <div className="text-xs text-white/40">Confirmation rate</div>
                <div className="mt-3 space-y-1.5">
                  {[
                    { label: "Confirmed", w: "80%", color: "bg-emerald-400" },
                    { label: "Pending", w: "14%", color: "bg-amber-400" },
                    { label: "Cancelled", w: "6%", color: "bg-red-400" },
                  ].map((bar) => (
                    <div key={bar.label} className="flex items-center gap-2">
                      <div className="w-16 text-[10px] text-white/30">{bar.label}</div>
                      <div className="flex-1 h-1 rounded-full bg-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: bar.w }}
                          transition={{ delay: 1.3, duration: 0.8 }}
                          className={`h-full rounded-full ${bar.color}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Delivery stat */}
            <div
              className="rounded-2xl border border-white/10 p-5 relative overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(16px)" }}
            >
              <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15) 0%, transparent 60%)" }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                  </div>
                  <span className="text-sm font-semibold text-white">ROAS</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">3.2x</div>
                <div className="text-xs text-white/40">Average return on ad spend</div>
                <div className="mt-3 flex gap-1 items-end h-10">
                  {[3, 5, 4, 7, 6, 8, 9].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${h * 10}%` }}
                      transition={{ delay: 1.2 + i * 0.07, duration: 0.4 }}
                      className="flex-1 rounded-t-sm bg-gradient-to-t from-amber-500/80 to-amber-300/40"
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section ref={statsRef} className="py-14 border-y border-white/8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-transparent to-emerald-500/5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: "Orders Processed", value: ordersCount, suffix: "+", icon: Package, color: "text-violet-400" },
              { label: "Active Merchants", value: merchantsCount, suffix: "+", icon: Users, color: "text-emerald-400" },
              { label: "Cities Covered", value: citiesCount, suffix: "", icon: MapPin, color: "text-amber-400" },
              { label: "Delivery Rate", value: deliveryRate, suffix: "%", icon: TrendingUp, color: "text-pink-400" },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  variants={fadeUp}
                  className="text-center"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                    <span className={`text-3xl sm:text-4xl font-bold ${stat.color}`}>
                      {stat.value.toLocaleString()}{stat.suffix}
                    </span>
                  </div>
                  <p className="text-sm text-white/40">{stat.label}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16 sm:mb-20">
            <motion.div variants={fadeUp} className="mb-4">
              <span className="px-4 py-1.5 rounded-full border border-white/15 bg-white/5 text-white/60 text-sm font-medium">
                Platform Features
              </span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-white">
              Everything Your Business Needs
            </motion.h2>
            <motion.p variants={fadeUp} className="text-white/50 max-w-2xl mx-auto text-lg">
              A complete operating system for e-commerce logistics — from first order to final reconciliation.
            </motion.p>
          </AnimatedSection>

          <div className="space-y-24 sm:space-y-32">
            {featureSections.map((section) => {
              const Animation = section.animation;
              return (
                <AnimatedSection key={section.id}>
                  <div className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center`}>
                    <motion.div
                      variants={fadeUp}
                      className={`space-y-6 ${section.reverse ? "lg:order-2" : ""}`}
                    >
                      <span className="px-3 py-1 rounded-full border border-white/15 bg-white/5 text-white/60 text-xs font-medium">
                        {section.badge}
                      </span>
                      <h3 className="text-2xl sm:text-3xl font-bold text-white">{section.title}</h3>
                      <p className="text-white/50 leading-relaxed">{section.description}</p>
                      <a href="/auth">
                        <button
                          data-testid={`button-feature-${section.id}`}
                          className="group flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/15 bg-white/5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
                        >
                          Learn More
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </a>
                    </motion.div>
                    <motion.div
                      variants={scaleIn}
                      className={`${section.reverse ? "lg:order-1" : ""}`}
                    >
                      <div
                        className="rounded-2xl border border-white/10 p-6 relative overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)" }}
                      >
                        <div
                          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${section.accent} pointer-events-none`}
                        />
                        <div className="relative z-10">
                          <Animation />
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS MARQUEE ── */}
      <section className="py-16 border-y border-white/8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-transparent to-emerald-500/5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="text-center mb-8">
            <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-bold mb-3 text-white">
              Integrations That Power Your Business
            </motion.h2>
            <motion.p variants={fadeUp} className="text-white/40">
              Seamlessly connected with the tools you already use
            </motion.p>
          </AnimatedSection>
          <IntegrationSlider />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeUp} className="mb-4">
              <span className="px-4 py-1.5 rounded-full border border-white/15 bg-white/5 text-white/60 text-sm font-medium">
                How It Works
              </span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4 text-white">
              Your Complete E-Commerce Journey
            </motion.h2>
            <motion.p variants={fadeUp} className="text-white/40 max-w-2xl mx-auto">
              From connecting your store to AI-powered analytics — every step automated and optimized.
            </motion.p>
          </AnimatedSection>
          <VisualFlowChart />
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="py-24 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-30"
            style={{ background: "radial-gradient(ellipse at 50% 100%, #4f46e5 0%, #10b981 35%, transparent 70%)" }}
          />
          <div
            className="absolute inset-0 opacity-15"
            style={{ background: "radial-gradient(ellipse at 20% 80%, #ec4899 0%, transparent 50%)" }}
          />
        </div>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
          className="absolute -top-24 -right-24 w-64 h-64 rounded-full border border-violet-500/10"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full border border-emerald-500/10"
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl font-bold text-white mb-4"
          >
            Ready to Transform Your Operations?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-white/50 mb-8 max-w-2xl mx-auto text-lg"
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
            <a href="/auth">
              <button
                data-testid="button-cta-bottom"
                className="px-7 py-3.5 rounded-full text-base font-semibold bg-gradient-to-r from-violet-600 to-emerald-500 text-white hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </button>
            </a>
            <Link href="/pricing">
              <button
                data-testid="button-cta-pricing"
                className="px-7 py-3.5 rounded-full text-base font-semibold border border-white/15 bg-white/5 text-white hover:bg-white/10 transition-colors"
              >
                View Pricing
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-violet-500/50 to-emerald-500/40" />
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-[300px] overflow-hidden">
          <div
            className="absolute top-[-80px] left-1/4 w-[500px] h-[300px] rounded-full blur-[120px] opacity-10"
            style={{ background: "radial-gradient(ellipse, #7c3aed 0%, transparent 70%)" }}
          />
          <div
            className="absolute top-[-60px] right-1/4 w-[400px] h-[250px] rounded-full blur-[120px] opacity-10"
            style={{ background: "radial-gradient(ellipse, #10b981 0%, transparent 70%)" }}
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-8 mb-12">
            <div className="col-span-2 md:col-span-4 lg:col-span-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-md bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl text-white">1SOL.AI</span>
              </div>
              <p className="text-sm text-white/40 mb-5 max-w-xs">
                The complete e-commerce operating system for Pakistani merchants. Orders, couriers, WhatsApp, ads — all in one place.
              </p>
              <div className="flex items-center gap-3">
                <a href="#" aria-label="WhatsApp" className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-violet-500/40 hover:bg-white/8 transition-all" data-testid="link-footer-social-whatsapp">
                  <SiWhatsapp className="w-4 h-4" />
                </a>
                <a href="#" aria-label="Instagram" className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-violet-500/40 hover:bg-white/8 transition-all" data-testid="link-footer-social-instagram">
                  <SiInstagram className="w-4 h-4" />
                </a>
                <a href="#" aria-label="Twitter / X" className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-violet-500/40 hover:bg-white/8 transition-all" data-testid="link-footer-social-twitter">
                  <SiX className="w-4 h-4" />
                </a>
              </div>
            </div>
            <div className="col-span-1 lg:col-span-2">
              <h4 className="font-semibold text-sm mb-4 text-white/70">Product</h4>
              <div className="space-y-2.5">
                <a href="#features" className="block text-sm text-white/40 hover:text-white transition-colors" data-testid="link-footer-features">Features</a>
                <Link href="/pricing"><span className="block text-sm text-white/40 hover:text-white transition-colors cursor-pointer" data-testid="link-footer-pricing">Pricing</span></Link>
                <a href="#how-it-works" className="block text-sm text-white/40 hover:text-white transition-colors" data-testid="link-footer-how-it-works">How it Works</a>
              </div>
            </div>
            <div className="col-span-1 lg:col-span-2">
              <h4 className="font-semibold text-sm mb-4 text-white/70">Company</h4>
              <div className="space-y-2.5">
                <Link href="/contact"><span className="block text-sm text-white/40 hover:text-white transition-colors cursor-pointer" data-testid="link-footer-contact">Contact</span></Link>
                <a href="/auth" className="block text-sm text-white/40 hover:text-white transition-colors" data-testid="link-footer-login">Sign In</a>
              </div>
            </div>
            <div className="col-span-1 lg:col-span-2">
              <h4 className="font-semibold text-sm mb-4 text-white/70">Legal</h4>
              <div className="space-y-2.5">
                <Link href="/privacy-policy"><span className="block text-sm text-white/40 hover:text-white transition-colors cursor-pointer" data-testid="link-footer-privacy">Privacy Policy</span></Link>
                <Link href="/terms-of-service"><span className="block text-sm text-white/40 hover:text-white transition-colors cursor-pointer" data-testid="link-footer-terms">Terms of Service</span></Link>
                <Link href="/data-deletion"><span className="block text-sm text-white/40 hover:text-white transition-colors cursor-pointer" data-testid="link-footer-data-deletion">Data Deletion</span></Link>
              </div>
            </div>
            <div className="col-span-2 md:col-span-4 lg:col-span-2">
              <h4 className="font-semibold text-sm mb-4 text-white/70">Stay Updated</h4>
              <p className="text-sm text-white/40 mb-3">Get product updates and tips for Pakistani merchants.</p>
              <div className="space-y-2">
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 focus:bg-white/8 transition-all"
                  data-testid="input-footer-newsletter"
                />
                <button
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-emerald-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  data-testid="button-footer-subscribe"
                >
                  <Send className="w-3.5 h-3.5" />
                  Stay updated
                </button>
              </div>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-8" />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm text-white/30">
              © {new Date().getFullYear()} 1SOL.AI. All rights reserved.
            </p>
            <p className="text-sm text-white/30 flex items-center gap-1.5">
              <span>Made for Pakistani merchants</span>
              <span>🇵🇰</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
