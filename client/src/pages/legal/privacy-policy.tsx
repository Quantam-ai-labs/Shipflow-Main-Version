import { Link } from "wouter";
import { PublicLayout } from "@/components/public-layout";

const sections = [
  { id: "introduction", title: "1. Introduction" },
  { id: "information-we-collect", title: "2. Information We Collect" },
  { id: "how-we-use", title: "3. How We Use Your Information" },
  { id: "data-sharing", title: "4. Data Sharing & Third-Party Services" },
  { id: "data-storage", title: "5. Data Storage & Security" },
  { id: "data-retention", title: "6. Data Retention" },
  { id: "your-rights", title: "7. Your Rights" },
  { id: "cookies", title: "8. Cookies & Tracking" },
  { id: "childrens-privacy", title: "9. Children's Privacy" },
  { id: "governing-law", title: "10. Governing Law" },
  { id: "changes", title: "11. Changes to This Policy" },
  { id: "contact", title: "12. Contact Us" },
];

export default function PrivacyPolicy() {
  return (
    <PublicLayout>
      <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8" data-testid="privacy-policy-page">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10">
            <span className="px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium">
              Legal
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold bg-gradient-to-r from-violet-400 via-white to-emerald-400 bg-clip-text text-transparent">
              Privacy Policy
            </h1>
            <p className="text-sm text-white/30 mt-2">Last updated: March 12, 2026</p>
          </div>

          <div className="flex gap-10">
            {/* Sticky TOC — desktop only */}
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="sticky top-24 rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-4">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">On this page</p>
                <nav className="space-y-1.5">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="block text-xs text-white/40 hover:text-white/80 transition-colors leading-relaxed"
                    >
                      {s.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-6 sm:p-8 space-y-8">
              <section id="introduction" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">1. Introduction</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  1SOL.AI ("we", "us", or "our") operates a logistics, marketing automation, and business management platform for e-commerce merchants in Pakistan. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform, including our web application, APIs, and related services.
                </p>
                <p className="text-sm leading-relaxed text-white/50">
                  By using 1SOL.AI, you consent to the data practices described in this policy. If you do not agree, please discontinue use of our platform immediately.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="information-we-collect" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">2. Information We Collect</h2>
                <p className="text-sm leading-relaxed text-white/50">We collect information that you provide directly to us, including:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Account information (name, email address, phone number, business details)</li>
                  <li>Shopify store data (orders, products, customer information, fulfillment data) via authorized OAuth API access</li>
                  <li>Facebook/Meta account information when you connect via OAuth (ad accounts, pages, Instagram accounts, campaign data)</li>
                  <li>WhatsApp Business API credentials and message logs when you connect your WhatsApp account</li>
                  <li>Courier account credentials (Leopards, PostEx, TCS) for shipment booking and tracking</li>
                  <li>Financial and accounting data including COD amounts, payment records, expenses, and transaction histories</li>
                  <li>Usage data and analytics about how you interact with our platform</li>
                  <li>AI conversation logs when using our AI assistant features</li>
                  <li>Contact form submissions and support communications</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="how-we-use" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">3. How We Use Your Information</h2>
                <p className="text-sm leading-relaxed text-white/50">We use the information we collect to:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Provide, maintain, and improve our platform services</li>
                  <li>Sync, process, and manage your e-commerce orders</li>
                  <li>Book shipments and track deliveries across multiple courier services</li>
                  <li>Send WhatsApp and voice-based (RoboCall) order confirmation messages on your behalf to your customers</li>
                  <li>Create, manage, and optimize Facebook/Instagram advertising campaigns on your behalf</li>
                  <li>Perform COD reconciliation and financial accounting operations</li>
                  <li>Generate AI-powered analytics, insights, and business reports</li>
                  <li>Communicate with you about your account, updates, and our services</li>
                  <li>Detect, investigate, and prevent fraud or unauthorized activities</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="data-sharing" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">4. Data Sharing & Third-Party Services</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  We do not sell your personal information. We share data with the following categories of third-party service providers as necessary to operate our platform:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li><span className="text-white/70 font-medium">Shopify:</span> Order data synchronization and store management</li>
                  <li><span className="text-white/70 font-medium">Meta (Facebook/Instagram):</span> Advertising campaign creation, management, and performance tracking</li>
                  <li><span className="text-white/70 font-medium">WhatsApp Business API:</span> Customer communication and order confirmation messaging</li>
                  <li><span className="text-white/70 font-medium">Courier services (Leopards, PostEx, TCS):</span> Shipment booking, tracking, and delivery management</li>
                  <li><span className="text-white/70 font-medium">OpenAI:</span> AI-powered business analytics and natural language processing (anonymized data)</li>
                  <li><span className="text-white/70 font-medium">Resend:</span> Transactional email delivery</li>
                </ul>
                <p className="text-sm leading-relaxed text-white/50">
                  All third-party providers are bound by their respective privacy policies and applicable data protection laws. We only share the minimum data necessary to provide the requested service.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="data-storage" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">5. Data Storage & Security</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  We implement appropriate technical and organizational security measures to protect your data, including:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Encryption of sensitive credentials (access tokens, API keys) using AES-256 encryption at rest</li>
                  <li>Secure HTTPS connections for all data transmission</li>
                  <li>Role-based access control for multi-tenant data isolation</li>
                  <li>Regular security audits and vulnerability assessments</li>
                  <li>Data stored on secure cloud infrastructure with automated backups</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="data-retention" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">6. Data Retention</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  We retain your data for as long as your account is active or as needed to provide our services. Specifically:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Account data: Retained while your account is active, deleted within 30 days of account closure</li>
                  <li>Order and shipment data: Retained for 2 years for reporting and audit purposes</li>
                  <li>Financial records: Retained for 5 years as required by Pakistani tax regulations</li>
                  <li>AI conversation logs: Retained for 90 days, then automatically purged</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="your-rights" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">7. Your Rights</h2>
                <p className="text-sm leading-relaxed text-white/50">You have the right to:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Access the personal data we hold about you</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your data (see our <Link href="/data-deletion"><span className="text-violet-400 cursor-pointer hover:text-violet-300 transition-colors">Data Deletion</span></Link> page)</li>
                  <li>Disconnect third-party integrations (Shopify, Facebook, WhatsApp, couriers) at any time from Settings</li>
                  <li>Export your data in a portable format</li>
                  <li>Opt out of non-essential communications</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="cookies" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">8. Cookies & Tracking</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  We use essential cookies for authentication and session management. We do not use third-party tracking cookies or advertising pixels on our platform. Analytics data is collected server-side without third-party trackers.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="childrens-privacy" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">9. Children's Privacy</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  1SOL.AI is a business platform not intended for use by individuals under 18 years of age. We do not knowingly collect personal data from minors.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="governing-law" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">10. Governing Law</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  This Privacy Policy is governed by the laws of Pakistan, including the Prevention of Electronic Crimes Act (PECA) 2016 and any applicable data protection regulations. Any disputes shall be subject to the exclusive jurisdiction of courts in Lahore, Pakistan.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="changes" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">11. Changes to This Policy</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  We may update this Privacy Policy from time to time. We will notify you of material changes by email or through a notice on our platform. Your continued use of 1SOL.AI after changes constitutes acceptance of the updated policy.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="contact" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">12. Contact Us</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at:{" "}
                  <a href="mailto:usamax.mail@gmail.com" className="text-violet-400 hover:text-violet-300 transition-colors">usamax.mail@gmail.com</a>
                  {" "}or visit our{" "}
                  <Link href="/contact"><span className="text-violet-400 cursor-pointer hover:text-violet-300 transition-colors">Contact</span></Link> page.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
