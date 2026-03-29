import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MessageSquare, MapPin, Send, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PublicLayout } from "@/components/public-layout";

export default function ContactPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
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
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).message || "Failed to send");
      }
      setSent(true);
      toast({ title: "Message sent successfully! We'll get back to you soon." });
    } catch (err: any) {
      toast({ title: err.message || "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-violet-500/50 focus:bg-white/8 transition-all";
  const labelClass = "block text-sm font-medium mb-1.5 text-white/60";

  return (
    <PublicLayout>
      <div data-testid="contact-page">
        {/* ── HERO ── */}
        <section className="relative pt-28 sm:pt-36 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-[140px] opacity-20"
              style={{ background: "radial-gradient(ellipse, #7c3aed 0%, #10b981 50%, transparent 70%)" }}
            />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 inline-block"
            >
              <span className="px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm font-medium">
                Contact Us
              </span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-5 leading-tight"
            >
              Get in{" "}
              <span className="bg-gradient-to-r from-violet-400 via-emerald-400 to-amber-400 bg-clip-text text-transparent">
                Touch
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-white/50 text-lg max-w-xl mx-auto"
            >
              Have questions about 1SOL.AI? We'd love to hear from you.
            </motion.p>
          </div>
        </section>

        {/* ── CONTENT ── */}
        <section className="pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-5 gap-8">
              {/* Contact form */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-3"
              >
                <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-6 sm:p-8">
                  {sent ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-12"
                    >
                      <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Message Sent!</h3>
                      <p className="text-white/40 mb-6">
                        Thank you for reaching out. We'll get back to you within 24 hours.
                      </p>
                      <button
                        onClick={() => { setSent(false); setForm({ name: "", email: "", phone: "", company: "", message: "" }); }}
                        className="px-5 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition-colors"
                        data-testid="button-send-another"
                      >
                        Send Another Message
                      </button>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className={labelClass}>Name *</label>
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className={inputClass}
                            placeholder="Your name"
                            data-testid="input-name"
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Email *</label>
                          <input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className={inputClass}
                            placeholder="you@company.com"
                            data-testid="input-email"
                          />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className={labelClass}>Phone</label>
                          <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            className={inputClass}
                            placeholder="03XX XXXXXXX"
                            data-testid="input-phone"
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Company</label>
                          <input
                            type="text"
                            value={form.company}
                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                            className={inputClass}
                            placeholder="Your company name"
                            data-testid="input-company"
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Message *</label>
                        <textarea
                          value={form.message}
                          onChange={(e) => setForm({ ...form, message: e.target.value })}
                          rows={5}
                          className={`${inputClass} resize-none`}
                          placeholder="Tell us how we can help..."
                          data-testid="input-message"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={sending}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                        data-testid="button-submit"
                      >
                        {sending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Send Message
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              </motion.div>

              {/* Info cards */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="lg:col-span-2 space-y-4"
              >
                <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1 text-white">Email</h3>
                      <a
                        href="mailto:usamax.mail@gmail.com"
                        className="text-sm text-white/40 hover:text-violet-400 transition-colors"
                        data-testid="link-email"
                      >
                        usamax.mail@gmail.com
                      </a>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1 text-white">WhatsApp</h3>
                      <p className="text-sm text-white/40" data-testid="text-whatsapp">+92 300 1234567</p>
                      <p className="text-xs text-white/25 mt-1">Mon-Sat, 9am-6pm PKT</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1 text-white">Office</h3>
                      <p className="text-sm text-white/40" data-testid="text-address">Lahore, Pakistan</p>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden"
                  data-testid="card-location-map"
                >
                  <div className="relative w-full h-36">
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.08) 0%, transparent 70%)" }}
                    >
                      <div className="text-center">
                        <div className="w-10 h-10 rounded-full bg-violet-500/15 flex items-center justify-center mx-auto mb-2">
                          <MapPin className="w-5 h-5 text-violet-400" />
                        </div>
                        <p className="font-semibold text-sm text-white">Lahore, Pakistan</p>
                        <p className="text-xs text-white/30">Punjab, PK 54000</p>
                      </div>
                    </div>
                    <div className="absolute inset-0 opacity-[0.06]" style={{
                      backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
                      backgroundSize: "20px 20px",
                    }} />
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 backdrop-blur-xl p-5">
                  <h3 className="font-semibold text-sm mb-2 text-white">Need help right away?</h3>
                  <p className="text-sm text-white/40 mb-4">
                    Sign in to access live chat support and documentation.
                  </p>
                  <a href="/auth">
                    <button
                      className="w-full py-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm font-medium hover:bg-violet-500/20 transition-colors flex items-center justify-center gap-1.5"
                      data-testid="button-support"
                    >
                      Access Support
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </a>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
