export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-6" data-testid="privacy-policy-page">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: March 12, 2026</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">1. Introduction</h2>
        <p className="text-sm leading-relaxed">
          1SOL.AI ("we", "us", or "our") operates a logistics and marketing automation platform for e-commerce merchants. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2. Information We Collect</h2>
        <p className="text-sm leading-relaxed">We collect information that you provide directly to us, including:</p>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>Account information (name, email address, business details)</li>
          <li>Shopify store data (orders, products, customer information) via authorized API access</li>
          <li>Facebook/Meta account information when you connect via OAuth (ad accounts, pages, Instagram accounts)</li>
          <li>WhatsApp Business API credentials when you connect your WhatsApp account</li>
          <li>Usage data and analytics about how you interact with our platform</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
        <p className="text-sm leading-relaxed">We use the information we collect to:</p>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>Provide, maintain, and improve our platform services</li>
          <li>Process and manage your orders and order confirmations</li>
          <li>Send WhatsApp and voice-based order confirmation messages on your behalf</li>
          <li>Create and manage Facebook/Instagram advertising campaigns on your behalf</li>
          <li>Generate analytics and reports about your business performance</li>
          <li>Communicate with you about your account and our services</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">4. Data Sharing</h2>
        <p className="text-sm leading-relaxed">
          We do not sell your personal information. We may share data with third-party service providers necessary to operate our platform, including Meta (Facebook/Instagram) for advertising services, WhatsApp for messaging services, and Shopify for e-commerce integration. All third-party providers are bound by their own privacy policies and applicable data protection laws.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">5. Data Security</h2>
        <p className="text-sm leading-relaxed">
          We implement appropriate technical and organizational security measures to protect your data, including encryption of sensitive credentials (access tokens, API keys) and secure server-side storage.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">6. Data Retention</h2>
        <p className="text-sm leading-relaxed">
          We retain your data for as long as your account is active or as needed to provide our services. You may request deletion of your data at any time by contacting us.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">7. Your Rights</h2>
        <p className="text-sm leading-relaxed">You have the right to:</p>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Disconnect third-party integrations (Facebook, WhatsApp) at any time</li>
          <li>Export your data in a portable format</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">8. Contact Us</h2>
        <p className="text-sm leading-relaxed">
          If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at: <strong>usamax.mail@gmail.com</strong>
        </p>
      </section>
    </div>
  );
}
