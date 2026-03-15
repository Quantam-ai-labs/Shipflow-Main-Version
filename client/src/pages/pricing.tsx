import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import {
  Package,
  ArrowRight,
  CheckCircle2,
  X as XIcon,
  ChevronDown,
  Zap,
  Star,
  Building,
} from "lucide-react";

const plans = [
  {
    name: "Free",
    icon: Zap,
    monthlyPrice: 0,
    annualPrice: 0,
    description: "Perfect for getting started with basic logistics management.",
    popular: false,
    features: [
      { text: "Up to 100 orders/month", included: true },
      { text: "1 Shopify store", included: true },
      { text: "2 courier integrations", included: true },
      { text: "Basic order tracking", included: true },
      { text: "WhatsApp confirmation (50/mo)", included: true },
      { text: "Basic analytics", included: true },
      { text: "Meta Ads management", included: false },
      { text: "AI insights", included: false },
      { text: "COD reconciliation", included: false },
      { text: "Accounting module", included: false },
      { text: "RoboCall confirmation", included: false },
      { text: "Priority support", included: false },
    ],
  },
  {
    name: "Pro",
    icon: Star,
    monthlyPrice: 4999,
    annualPrice: 3999,
    description: "For growing businesses that need full automation and insights.",
    popular: true,
    features: [
      { text: "Up to 2,000 orders/month", included: true },
      { text: "3 Shopify stores", included: true },
      { text: "All courier integrations", included: true },
      { text: "Real-time tracking & webhooks", included: true },
      { text: "WhatsApp confirmation (unlimited)", included: true },
      { text: "Advanced analytics & reports", included: true },
      { text: "Meta Ads management", included: true },
      { text: "AI insights & assistant", included: true },
      { text: "COD reconciliation", included: true },
      { text: "Basic accounting", included: true },
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
    <div className="min-h-screen bg-background" data-testid="pricing-page">
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
              <Link href="/"><span className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium cursor-pointer">Home</span></Link>
              <Link href="/contact"><span className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium cursor-pointer">Contact</span></Link>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <a href="/auth">
                <Button data-testid="button-login" size="sm">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <Badge variant="outline" className="mb-4">Pricing</Badge>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Simple, Transparent Pricing
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg mb-8">
              Start free. Scale as you grow. No hidden fees.
            </p>
            <div className="flex items-center justify-center gap-3">
              <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
              <button
                onClick={() => setAnnual(!annual)}
                className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-primary" : "bg-muted"}`}
                data-testid="toggle-billing"
              >
                <motion.div
                  animate={{ x: annual ? 24 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white"
                />
              </button>
              <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>
                Annual
                <Badge variant="secondary" className="ml-2 text-[10px]">Save 20%</Badge>
              </span>
            </div>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, i) => {
              const Icon = plan.icon;
              const price = annual ? plan.annualPrice : plan.monthlyPrice;
              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                >
                  <Card className={`relative h-full ${plan.popular ? "border-primary border-2" : ""}`} data-testid={`card-plan-${plan.name.toLowerCase()}`}>
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                      </div>
                    )}
                    <CardContent className="p-6 flex flex-col h-full">
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <h3 className="text-xl font-bold">{plan.name}</h3>
                        </div>
                        <div className="mb-3">
                          {price === 0 ? (
                            <div className="flex items-baseline gap-1">
                              <span className="text-4xl font-bold">Free</span>
                              <span className="text-muted-foreground text-sm">forever</span>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm text-muted-foreground">PKR</span>
                              <span className="text-4xl font-bold">{price.toLocaleString()}</span>
                              <span className="text-muted-foreground text-sm">/month</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{plan.description}</p>
                      </div>
                      <div className="space-y-3 flex-1 mb-6">
                        {plan.features.map((feature) => (
                          <div key={feature.text} className="flex items-start gap-2">
                            {feature.included ? (
                              <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            ) : (
                              <XIcon className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                            )}
                            <span className={`text-sm ${feature.included ? "text-foreground" : "text-muted-foreground/50"}`}>
                              {feature.text}
                            </span>
                          </div>
                        ))}
                      </div>
                      <a href="/auth">
                        <Button
                          className="w-full"
                          variant={plan.popular ? "default" : "outline"}
                          data-testid={`button-plan-${plan.name.toLowerCase()}`}
                        >
                          {plan.monthlyPrice === 0 ? "Get Started Free" : "Start Free Trial"}
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </a>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/20 border-y">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Frequently Asked Questions</h2>
            <p className="text-muted-foreground">Everything you need to know about our pricing</p>
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
                  className="w-full flex items-center justify-between p-4 rounded-lg border bg-background hover:bg-muted/30 transition-colors text-left"
                  data-testid={`button-faq-${i}`}
                >
                  <span className="font-medium text-sm pr-4">{faq.question}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 pb-4"
                  >
                    <p className="text-sm text-muted-foreground pt-2">{faq.answer}</p>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Need a Custom Plan?</h2>
          <p className="text-muted-foreground mb-6">
            For high-volume merchants or special requirements, we offer tailored solutions.
          </p>
          <Link href="/contact">
            <Button size="lg" data-testid="button-contact-sales">
              Contact Sales
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="py-12 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Package className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl">1SOL.AI</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/privacy-policy"><span className="hover:text-foreground transition-colors cursor-pointer">Privacy</span></Link>
              <Link href="/terms-of-service"><span className="hover:text-foreground transition-colors cursor-pointer">Terms</span></Link>
              <Link href="/data-deletion"><span className="hover:text-foreground transition-colors cursor-pointer">Data Deletion</span></Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} 1SOL.AI
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
