import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  ArrowRight,
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  Send,
  CheckCircle2,
  Loader2,
} from "lucide-react";

export default function ContactPage() {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send message");
      }
      setSent(true);
      toast({ title: "Message sent successfully! We'll get back to you soon." });
    } catch (err: any) {
      toast({ title: err.message || "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="contact-page">
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
              <Link href="/pricing"><span className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium cursor-pointer">Pricing</span></Link>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <a href="/api/login">
                <Button data-testid="button-login" size="sm">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-28 sm:pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <Badge variant="outline" className="mb-4">Contact Us</Badge>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Get in Touch
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              Have questions about 1SOL.AI? We'd love to hear from you.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-5 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-3"
            >
              <Card>
                <CardContent className="p-6 sm:p-8">
                  {sent ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-12"
                    >
                      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">Message Sent!</h3>
                      <p className="text-muted-foreground mb-6">
                        Thank you for reaching out. We'll get back to you within 24 hours.
                      </p>
                      <Button variant="outline" onClick={() => { setSent(false); setForm({ name: "", email: "", phone: "", company: "", message: "" }); }} data-testid="button-send-another">
                        Send Another Message
                      </Button>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Name *</label>
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                            placeholder="Your name"
                            data-testid="input-name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Email *</label>
                          <input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                            placeholder="you@company.com"
                            data-testid="input-email"
                          />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Phone</label>
                          <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                            placeholder="03XX XXXXXXX"
                            data-testid="input-phone"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Company</label>
                          <input
                            type="text"
                            value={form.company}
                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                            placeholder="Your company name"
                            data-testid="input-company"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Message *</label>
                        <textarea
                          value={form.message}
                          onChange={(e) => setForm({ ...form, message: e.target.value })}
                          rows={5}
                          className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none"
                          placeholder="Tell us how we can help..."
                          data-testid="input-message"
                        />
                      </div>
                      <Button type="submit" disabled={sending} className="w-full sm:w-auto" data-testid="button-submit">
                        {sending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send Message
                          </>
                        )}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="lg:col-span-2 space-y-4"
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Email</h3>
                      <a href="mailto:usamax.mail@gmail.com" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-email">
                        usamax.mail@gmail.com
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">WhatsApp</h3>
                      <p className="text-sm text-muted-foreground" data-testid="text-whatsapp">
                        +92 300 1234567
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Mon-Sat, 9am-6pm PKT</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Office</h3>
                      <p className="text-sm text-muted-foreground" data-testid="text-address">
                        Lahore, Pakistan
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="overflow-hidden" data-testid="card-location-map">
                <div className="relative w-full h-40 bg-muted">
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                        <MapPin className="w-6 h-6 text-primary" />
                      </div>
                      <p className="font-semibold text-sm">Lahore, Pakistan</p>
                      <p className="text-xs text-muted-foreground">Punjab, PK 54000</p>
                    </div>
                  </div>
                  <div className="absolute inset-0 opacity-[0.08]" style={{
                    backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }} />
                </div>
              </Card>
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-sm mb-2">Need help right away?</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Check our documentation or sign in to access live chat support.
                  </p>
                  <a href="/api/login">
                    <Button variant="outline" size="sm" className="w-full" data-testid="button-support">
                      Access Support
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </motion.div>
          </div>
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
