import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Package, Sparkles, Building, CheckCircle2, X as XIcon, ArrowRight, ChevronDown } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";

const plans = [
  {
    name: "Free",
    icon: Package,
    monthlyPrice: 0,
    annualPrice: 0,
    description: "Perfect for new merchants just getting started.",
    popular: false,
    accent: "from-white/10 to-white/5",
    iconBg: "bg-white/10",
    iconColor: "text-white/60",
    features: [
      { text: "Up to 100 orders/month", included: true },
      { text: "1 store integration", included: true },
      { text: "Leopards & PostEx only", included: true },
      { text: "Basic order tracking", included: true },
      { text: "WhatsApp confirmation (50/mo)", included: true },
      { text: "Basic analytics dashboard", included: true },
      { text: "Meta Ads integration", included: false },
      { text: "AI insights", included: false },
      { text: "COD reconciliation", included: false },
      { text: "Accounting suite", included: false },
      { text: "RoboCall confirmation", included: false },
      { text: "Priority support", included: false },
    ],
  },
  {
    name: "Pro",
    icon: Sparkles,
    monthlyPrice: 4999,
    annualPrice: 3999,
    description: "For growing merchants scaling their operations.",
    popular: true,
    accent: "from-violet-500/20 to-emerald-500/10",
    iconBg: "bg-gradient-to-br from-violet-500/30 to-emerald-500/20",
    iconColor: "text-violet-300",
    features: [
      { text: "Up to 2,000 orders/month", included: true },
      { text: "3 store integrations", included: true },
      { text: "All courier integrations", included: true },
      { text: "Real-time tracking", included: true },
      { text: "WhatsApp confirmation (500/mo)", included: true },
      { text: "Advanced analytics", included: true },
      { text: "Meta Ads integration", included: true },
      { text: "AI insights", included: true },
      { text: "COD reconciliation", included: true },
      { text: "Basic accounting suite", included: true },
      { text: "RoboCall confirmation", included: false },
      { text: "Priority support", included: false },
    ],
  },
  {
    name: "Enterprise",
    icon: Building,
    monthlyPrice: 14999,
    annualPrice: 11999,
    description: "For high-volume merchants with complete operational needs.",
    popular: false,
    accent: "from-amber-500/10 to-white/5",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-300",
    features: [
      { text: "Unlimited orders", included: true },
      { text: "Unlimited stores", included: true },
      { text: "All courier integrations", included: true },
      { text: "Real-time tracking & webhooks", included: true },
      { text: "WhatsApp confirmation (unlimited)", included: true },
      { text: "Custom analytics & reports", included: true },
      { text: "Meta Ads + bulk launch", included: true },
      { text: "AI insights + custom models", included: true },
      { text: "Full COD reconciliation", included: true },
      { text: "Full accounting suite", included: true },
      { text: "RoboCall confirmation", included: true },
      { text: "Priority support + SLA", included: true },
    ],
  },
];

const faqs = [
  {
    question: "Can I switch plans at any time?",
    answer: "Yes, you can upgrade or downgrade your plan at any time. When upgrading, you'll get immediate access to new features. When downgrading, changes take effect at the start of your next billing cycle.",
  },
  {
    question: "Is there a free trial for paid plans?",
    answer: "Yes! All paid plans come with a 14-day free trial. No credit card required to start. You'll only be charged when the trial ends and you choose to continue.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept JazzCash, Easypaisa, bank transfers, and international credit/debit cards (Visa, Mastercard). For Enterprise plans, we also support wire transfers.",
  },
  {
    question: "What happens when I exceed my order limit?",
    answer: "We'll notify you when you reach 80% of your limit. If you exceed the limit, orders will still be processed but you'll be prompted to upgrade. No orders are ever lost.",
  },
  {
    question: "Do I need to pay separately for WhatsApp messages?",
    answer: "WhatsApp message costs (charged by Meta) are separate from the plan subscription. However, our platform fee for managing WhatsApp flows is included in your plan. We pass through Meta's per-message cost at no markup.",
  },
  {
    question: "Can I cancel my subscription?",
    answer: "You can cancel your subscription at any time from your account settings. Your plan will remain active until the end of the current billing period. All your data is retained for 30 days after cancellation.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <div data-testid="pricing-page">
        {/* ── HERO ── */}
        <section className="relative pt-28 sm:pt-36 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full blur-[140px] opacity-20"
              style={{ background: "radial-gradient(ellipse, #7c3aed 0%, #10b981 50%, transparent 70%)" }}
            />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-5 inline-block"
            >
              <span className="px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm font-medium">
                Pricing
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-5 leading-tight"
            >
              Simple,{" "}
              <span className="bg-gradient-to-r from-violet-400 via-emerald-400 to-amber-400 bg-clip-text text-transparent">
                Transparent
              </span>{" "}
              Pricing
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-white/50 text-lg mb-10 max-w-2xl mx-auto"
            >
              Start free. Scale as you grow. No hidden fees.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center justify-center gap-3"
            >
              <span className={`text-sm font-medium ${!annual ? "text-white" : "text-white/40"}`}>Monthly</span>
              <button
                onClick={() => setAnnual(!annual)}
                className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-gradient-to-r from-violet-600 to-emerald-500" : "bg-white/15"}`}
                data-testid="toggle-billing"
              >
                <motion.div
                  animate={{ x: annual ? 24 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white"
                />
              </button>
              <span className={`text-sm font-medium flex items-center gap-2 ${annual ? "text-white" : "text-white/40"}`}>
                Annual
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold border border-emerald-500/30">
                  Save 20%
                </span>
              </span>
            </motion.div>
          </div>
        </section>

        {/* ── PRICING CARDS ── */}
        <section className="pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-6">
              {plans.map((plan, i) => {
                const Icon = plan.icon;
                const price = annual ? plan.annualPrice : plan.monthlyPrice;
                return (
                  <motion.div
                    key={plan.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    className="relative"
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-violet-600 to-emerald-500 text-white">
                          Most Popular
                        </span>
                      </div>
                    )}
                    <div
                      className={`relative flex flex-col h-full rounded-2xl border backdrop-blur-xl p-6 ${
                        plan.popular
                          ? "bg-white/6 border-violet-500/40"
                          : "bg-white/3 border-white/10"
                      }`}
                      data-testid={`card-plan-${plan.name.toLowerCase()}`}
                    >
                      {plan.popular && (
                        <div className="absolute inset-0 rounded-2xl pointer-events-none"
                          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 60%)" }}
                        />
                      )}

                      <div className="relative mb-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.iconBg}`}>
                            <Icon className={`w-5 h-5 ${plan.iconColor}`} />
                          </div>
                          <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                        </div>
                        <div className="mb-3">
                          {price === 0 ? (
                            <div className="flex items-baseline gap-1">
                              <span className="text-4xl font-bold text-white">Free</span>
                              <span className="text-white/40 text-sm">forever</span>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm text-white/40">PKR</span>
                              <span className="text-4xl font-bold text-white">{price.toLocaleString()}</span>
                              <span className="text-white/40 text-sm">/month</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-white/40">{plan.description}</p>
                      </div>

                      <div className="space-y-2.5 flex-1 mb-6">
                        {plan.features.map((feature) => (
                          <div key={feature.text} className="flex items-start gap-2">
                            {feature.included ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <XIcon className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />
                            )}
                            <span className={`text-sm ${feature.included ? "text-white/80" : "text-white/25"}`}>
                              {feature.text}
                            </span>
                          </div>
                        ))}
                      </div>

                      <a href="/auth">
                        <button
                          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            plan.popular
                              ? "bg-gradient-to-r from-violet-600 to-emerald-500 text-white hover:opacity-90"
                              : "bg-white/8 border border-white/15 text-white hover:bg-white/12 hover:border-white/25"
                          }`}
                          data-testid={`button-plan-${plan.name.toLowerCase()}`}
                        >
                          {plan.monthlyPrice === 0 ? "Get Started Free" : "Start Free Trial"}
                          <ArrowRight className="w-4 h-4 inline ml-1.5" />
                        </button>
                      </a>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-white/8">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Frequently Asked Questions</h2>
              <p className="text-white/40">Everything you need to know about our pricing</p>
            </motion.div>

            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/3 hover:bg-white/6 hover:border-white/20 transition-all text-left"
                    data-testid={`button-faq-${i}`}
                  >
                    <span className="font-medium text-sm text-white/80 pr-4">{faq.question}</span>
                    <ChevronDown className={`w-4 h-4 shrink-0 text-white/40 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="px-4 pb-4"
                    >
                      <p className="text-sm text-white/40 pt-3 leading-relaxed">{faq.answer}</p>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CUSTOM PLAN CTA ── */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="relative rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-10 sm:p-12 text-center overflow-hidden">
              <div className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 60%)" }}
              />
              <div className="relative">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Need a Custom Plan?</h2>
                <p className="text-white/40 mb-8 max-w-xl mx-auto">
                  For high-volume merchants or special requirements, we offer tailored solutions.
                </p>
                <Link href="/contact">
                  <button
                    data-testid="button-contact-sales"
                    className="px-7 py-3 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-600 to-emerald-500 text-white hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                  >
                    Contact Sales
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
