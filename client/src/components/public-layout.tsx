import { useState } from "react";
import { Link } from "wouter";
import { Package, Menu, X, ArrowRight, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SiWhatsapp, SiInstagram, SiX } from "react-icons/si";

function PublicFooter() {
  const [email, setEmail] = useState("");
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden" style={{ background: "#08080f" }}>
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
            <Link href="/">
              <div className="flex items-center gap-2 mb-4 cursor-pointer w-fit">
                <div className="w-8 h-8 rounded-md bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl text-white">1SOL.AI</span>
              </div>
            </Link>
            <p className="text-sm text-white/40 mb-5 max-w-xs">
              The complete e-commerce operating system for Pakistani merchants. Orders, couriers, WhatsApp, ads — all in one place.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="#"
                aria-label="WhatsApp"
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-violet-500/40 hover:bg-white/8 transition-all"
                data-testid="link-social-whatsapp"
              >
                <SiWhatsapp className="w-4 h-4" />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-violet-500/40 hover:bg-white/8 transition-all"
                data-testid="link-social-instagram"
              >
                <SiInstagram className="w-4 h-4" />
              </a>
              <a
                href="#"
                aria-label="Twitter / X"
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-violet-500/40 hover:bg-white/8 transition-all"
                data-testid="link-social-twitter"
              >
                <SiX className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="col-span-1 lg:col-span-2">
            <h4 className="font-semibold text-sm mb-4 text-white/70">Product</h4>
            <div className="space-y-2.5">
              <a href="/#features" className="block text-sm text-white/40 hover:text-white transition-colors" data-testid="link-footer-features">Features</a>
              <Link href="/pricing"><span className="block text-sm text-white/40 hover:text-white transition-colors cursor-pointer" data-testid="link-footer-pricing">Pricing</span></Link>
              <a href="/#how-it-works" className="block text-sm text-white/40 hover:text-white transition-colors" data-testid="link-footer-how-it-works">How it Works</a>
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
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 focus:bg-white/8 transition-all"
                data-testid="input-newsletter-email"
              />
              <button
                onClick={() => setEmail("")}
                className="px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-emerald-500 text-white text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
                data-testid="button-newsletter-subscribe"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-8" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-white/30">
            © {year} 1SOL.AI. All rights reserved.
          </p>
          <div className="h-px w-px hidden sm:block" />
          <p className="text-sm text-white/30 flex items-center gap-1.5">
            <span>Made for Pakistani merchants</span>
            <span>🇵🇰</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#08080f", color: "#fff" }}>
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
              <Link href="/"><span className="text-white/50 hover:text-white transition-colors text-sm font-medium cursor-pointer" data-testid="link-nav-home">Home</span></Link>
              <Link href="/pricing"><span className="text-white/50 hover:text-white transition-colors text-sm font-medium cursor-pointer" data-testid="link-nav-pricing">Pricing</span></Link>
              <Link href="/contact"><span className="text-white/50 hover:text-white transition-colors text-sm font-medium cursor-pointer" data-testid="link-nav-contact">Contact</span></Link>
            </div>

            <div className="flex items-center gap-3">
              <a href="/auth" className="hidden md:block">
                <button
                  data-testid="button-login"
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-600 to-emerald-500 text-white hover:opacity-90 transition-opacity flex items-center gap-1.5"
                >
                  Get Started
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </a>
              <button
                className="md:hidden p-2 text-white/70 hover:text-white"
                onClick={() => setMobileOpen(!mobileOpen)}
                data-testid="button-mobile-menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden border-t border-white/8 bg-[#0d0d1a] overflow-hidden"
            >
              <div className="px-4 py-4 space-y-3">
                <Link href="/"><span className="block text-sm font-medium text-white/60 hover:text-white cursor-pointer" onClick={() => setMobileOpen(false)}>Home</span></Link>
                <Link href="/pricing"><span className="block text-sm font-medium text-white/60 hover:text-white cursor-pointer" onClick={() => setMobileOpen(false)}>Pricing</span></Link>
                <Link href="/contact"><span className="block text-sm font-medium text-white/60 hover:text-white cursor-pointer" onClick={() => setMobileOpen(false)}>Contact</span></Link>
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

      <main className="flex-1">
        {children}
      </main>

      <PublicFooter />
    </div>
  );
}
