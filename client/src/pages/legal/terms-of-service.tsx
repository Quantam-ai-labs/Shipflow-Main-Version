import { Link } from "wouter";
import { PublicLayout } from "@/components/public-layout";

const sections = [
  { id: "acceptance", title: "1. Acceptance of Terms" },
  { id: "description", title: "2. Description of Service" },
  { id: "registration", title: "3. Account Registration & Eligibility" },
  { id: "subscription", title: "4. Subscription & Payment" },
  { id: "integrations", title: "5. Third-Party Integrations" },
  { id: "acceptable-use", title: "6. Acceptable Use" },
  { id: "data-ownership", title: "7. Data Ownership & IP" },
  { id: "availability", title: "8. Service Availability" },
  { id: "liability", title: "9. Limitation of Liability" },
  { id: "termination", title: "10. Termination" },
  { id: "governing-law", title: "11. Governing Law" },
  { id: "changes", title: "12. Changes to Terms" },
  { id: "contact", title: "13. Contact" },
];

export default function TermsOfService() {
  return (
    <PublicLayout>
      <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8" data-testid="terms-of-service-page">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10">
            <span className="px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium">
              Legal
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold bg-gradient-to-r from-violet-400 via-white to-emerald-400 bg-clip-text text-transparent">
              Terms of Service
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
              <section id="acceptance" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">1. Acceptance of Terms</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  By accessing or using the 1SOL.AI platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service. These Terms constitute a legally binding agreement between you and 1SOL.AI.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="description" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">2. Description of Service</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  1SOL.AI provides a comprehensive logistics, marketing, and business management platform for e-commerce merchants in Pakistan. Our services include:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Shopify store integration and order synchronization</li>
                  <li>Multi-courier shipment booking and tracking (Leopards, PostEx, TCS)</li>
                  <li>WhatsApp and RoboCall-based order confirmation automation</li>
                  <li>Facebook/Instagram advertising campaign management via Meta API</li>
                  <li>COD reconciliation and financial accounting</li>
                  <li>AI-powered business analytics and insights</li>
                  <li>Team collaboration with role-based access control</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="registration" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">3. Account Registration & Eligibility</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  You must be at least 18 years old and have a valid business registration (or operate as a sole proprietor) in Pakistan to use the Service. You must provide accurate and complete information when creating an account. You are responsible for:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Maintaining the confidentiality of your account credentials</li>
                  <li>All activities that occur under your account</li>
                  <li>Ensuring that team members added to your account comply with these Terms</li>
                  <li>Keeping your contact and business information up to date</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="subscription" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">4. Subscription & Payment</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  1SOL.AI offers Free, Pro, and Enterprise subscription tiers. Paid subscriptions are billed monthly or annually in Pakistani Rupees (PKR). By subscribing to a paid plan, you agree to:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Pay all fees associated with your selected plan</li>
                  <li>Automatic renewal unless cancelled before the billing cycle ends</li>
                  <li>Price changes communicated at least 30 days in advance</li>
                  <li>No refunds for partial months/periods upon cancellation</li>
                </ul>
                <p className="text-sm leading-relaxed text-white/50">
                  Third-party costs (WhatsApp message fees, Meta ad spend, courier booking fees) are separate from subscription fees and are your responsibility.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="integrations" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">5. Third-Party Integrations</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  The Service integrates with third-party platforms including Shopify, Meta (Facebook/Instagram), WhatsApp Business API, and various courier services. Your use of these integrations is subject to the respective third-party terms of service. By connecting these services, you authorize 1SOL.AI to:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Access and manage your accounts on these platforms as necessary to provide the Service</li>
                  <li>Store authentication tokens securely for ongoing service delivery</li>
                  <li>Send messages and create content on your behalf through connected platforms</li>
                  <li>Access reporting data for analytics and reconciliation purposes</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="acceptable-use" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">6. Acceptable Use</h2>
                <p className="text-sm leading-relaxed text-white/50">You agree not to:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Use the Service for any unlawful purpose or in violation of Pakistani law</li>
                  <li>Send spam or unsolicited messages through WhatsApp or RoboCall features</li>
                  <li>Violate any applicable advertising policies (Meta, WhatsApp, etc.)</li>
                  <li>Attempt to gain unauthorized access to any part of the Service or other users' data</li>
                  <li>Interfere with the proper working of the Service or its infrastructure</li>
                  <li>Use the AI features to generate harmful, misleading, or illegal content</li>
                  <li>Resell or redistribute the Service without written authorization</li>
                  <li>Use automated scripts or bots to access the Service outside of authorized APIs</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="data-ownership" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">7. Data Ownership & Intellectual Property</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  You retain ownership of all your business data, including orders, customer information, and financial records. 1SOL.AI retains ownership of the platform, its software, algorithms, and intellectual property. You grant us a limited license to process your data solely for the purpose of providing the Service.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="availability" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">8. Service Availability & Modifications</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  We strive for high availability but do not guarantee uninterrupted service. We reserve the right to modify, suspend, or discontinue features with reasonable notice. Planned maintenance will be communicated in advance when possible.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="liability" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">9. Limitation of Liability</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  The Service is provided "as is" without warranties of any kind, express or implied. 1SOL.AI shall not be liable for:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Any indirect, incidental, special, or consequential damages</li>
                  <li>Losses resulting from third-party service disruptions (Shopify, Meta, couriers)</li>
                  <li>Failed order confirmations, missed deliveries, or incorrect tracking data from courier APIs</li>
                  <li>Ad campaign performance or Meta ad policy violations</li>
                  <li>Financial losses arising from COD reconciliation discrepancies</li>
                </ul>
                <p className="text-sm leading-relaxed text-white/50">
                  Our total liability shall not exceed the amount paid by you for the Service in the 12 months preceding the claim.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="termination" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">10. Termination</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  We may terminate or suspend your access to the Service at any time for violation of these Terms, non-payment, or abuse. You may discontinue use of the Service and request deletion of your account at any time. Upon termination:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                  <li>Your data will be retained for 30 days, after which it will be permanently deleted</li>
                  <li>All connected third-party integrations will be disconnected</li>
                  <li>No refunds will be issued for the remaining subscription period</li>
                </ul>
              </section>

              <div className="h-px bg-white/6" />

              <section id="governing-law" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">11. Governing Law & Dispute Resolution</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  These Terms are governed by the laws of Pakistan. Any disputes arising from or related to these Terms shall be resolved through arbitration in Lahore, Pakistan, in accordance with the Arbitration Act 1940. If arbitration is not feasible, disputes shall be subject to the exclusive jurisdiction of courts in Lahore.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="changes" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">12. Changes to Terms</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  We may update these Terms from time to time. Material changes will be communicated via email or platform notification at least 30 days before taking effect. Continued use of the Service after changes constitutes acceptance.
                </p>
              </section>

              <div className="h-px bg-white/6" />

              <section id="contact" className="space-y-3 scroll-mt-28">
                <h2 className="text-lg font-semibold text-white/90">13. Contact</h2>
                <p className="text-sm leading-relaxed text-white/50">
                  For questions about these Terms of Service, contact us at:{" "}
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
