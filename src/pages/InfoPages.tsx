import { ArrowLeft, Globe, Smartphone, Shield, CreditCard, CheckCircle2 } from 'lucide-react';
import { navigate } from '@/lib/router';

export function InfoPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-400 hover:text-gray-600 mb-6">
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="font-display text-3xl font-bold text-gray-900 mb-6">{title}</h1>
          <div className="prose prose-gray max-w-none">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function HowItWorksPage() {
  return (
    <InfoPage title="How it works">
      <div className="space-y-6 text-gray-600">
        {[
          { icon: Smartphone, title: '1. Enter the phone number', desc: 'Type your recipient\'s phone number with the country code. Our system automatically detects the destination country and, where possible, the mobile operator.' },
          { icon: Globe, title: '2. Select a recharge amount', desc: 'We display the available recharge denominations for the detected operator, with the final price shown in your currency.' },
          { icon: CreditCard, title: '3. Pay securely', desc: 'Choose your payment method — PIX in Brazil or Stripe (cards, Apple Pay, Google Pay) elsewhere. Payments are processed through verified, PCI-compliant providers.' },
          { icon: CheckCircle2, title: '4. Recharge is delivered', desc: 'Once payment is confirmed by our secure webhook, the recharge is submitted to the operator instantly. You\'ll see the status on your confirmation page.' },
        ].map((s, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <s.icon className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </InfoPage>
  );
}

export function SupportPage() {
  return (
    <InfoPage title="Support">
      <div className="space-y-6 text-gray-600">
        <div>
          <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-600" /> Need help?
          </h2>
          <p>If you have questions about an order or need assistance, here are the quickest ways to get help:</p>
        </div>
        <div className="space-y-4">
          <div className="p-4 bg-brand-50 rounded-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Track an order</h3>
            <p className="text-sm">Use your order reference (e.g. GTU-XXXXXXXX) on the <button onClick={() => navigate('/track')} className="text-brand-600 font-medium underline">Track order page</button> to check its status at any time.</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Contact us</h3>
            <p className="text-sm">Email: support@globaltopup.com</p>
            <p className="text-sm mt-1">Our team responds within 24 hours, 7 days a week.</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Common questions</h3>
            <p className="text-sm mt-1"><strong>How long does a recharge take?</strong> Most recharges are delivered within seconds of payment confirmation.</p>
            <p className="text-sm mt-2"><strong>What if the recharge fails?</strong> If a recharge fails after payment, we automatically investigate and process a refund if the operator cannot deliver.</p>
            <p className="text-sm mt-2"><strong>Which payment methods are supported?</strong> PIX in Brazil and Stripe (cards, Apple Pay, Google Pay) in other markets.</p>
          </div>
        </div>
      </div>
    </InfoPage>
  );
}

export function TermsPage() {
  return (
    <InfoPage title="Terms of Service">
      <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
        <p>By using Global TopUp, you agree to these terms:</p>
        <p><strong>Service:</strong> Global TopUp facilitates international mobile airtime recharge through the DingConnect API. We act as an intermediary between you and the mobile operator.</p>
        <p><strong>Pricing:</strong> Prices displayed at checkout include the recharge amount, applicable profit margin, and service fees. The final price is calculated server-side and shown before payment.</p>
        <p><strong>Payment:</strong> Payments are processed by Stripe or Mercado Pago. We never store your card details. A recharge is only submitted after payment is verified by our secure webhook.</p>
        <p><strong>Refunds:</strong> If a recharge cannot be delivered after successful payment, you are entitled to a full refund. Refunds are processed to the original payment method.</p>
        <p><strong>Accuracy:</strong> You are responsible for entering the correct recipient phone number. Recharges sent to a wrong number may not be recoverable.</p>
        <p><strong>Availability:</strong> Service availability depends on DingConnect operator coverage. We do not guarantee that every operator or product will be available at all times.</p>
      </div>
    </InfoPage>
  );
}

export function PrivacyPage() {
  return (
    <InfoPage title="Privacy Policy">
      <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
        <p>Global TopUp respects your privacy. Here is how we handle your data:</p>
        <p><strong>What we collect:</strong> Your email (if you create an account), recipient phone numbers, and order details necessary to process recharges.</p>
        <p><strong>What we do not collect:</strong> We do not store payment card details. All card data is handled directly by Stripe and Mercado Pago.</p>
        <p><strong>How we use your data:</strong> To process orders, communicate about your transactions, and improve our service. We never sell your data.</p>
        <p><strong>Data security:</strong> All data is stored in Supabase with row-level security. API credentials are stored server-side only and never exposed to the browser.</p>
        <p><strong>Your rights:</strong> You can request access to or deletion of your data at any time by contacting support@globaltopup.com.</p>
      </div>
    </InfoPage>
  );
}

export function RefundsPage() {
  return (
    <InfoPage title="Refund Policy">
      <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
        <p>We want you to feel confident using Global TopUp. Here is our refund policy:</p>
        <p><strong>Recharge not delivered:</strong> If payment is confirmed but the recharge cannot be delivered by the operator, you will receive a full refund to your original payment method.</p>
        <p><strong>Processing time:</strong> Refunds are typically processed within 5 business days. The time for the refund to appear depends on your payment provider.</p>
        <p><strong>Wrong number:</strong> If you enter an incorrect recipient number and the recharge is successfully delivered to that number, we may not be able to recover the funds. Please double-check the number before paying.</p>
        <p><strong>How to request:</strong> Use the Track order page to check your order status. If your order shows a failed recharge, contact support@globaltopup.com with your order reference.</p>
        <p><strong>Reconciliation:</strong> We reconcile payment and recharge status independently. If a payment succeeded but the recharge failed, our system automatically flags it for refund processing.</p>
      </div>
    </InfoPage>
  );
}
