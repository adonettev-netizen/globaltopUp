import { Shield, Zap, Globe, ArrowRight, CheckCircle2, Users, Clock, Smartphone } from 'lucide-react';
import { PhoneLookup } from '@/components/PhoneLookup';
import { navigate } from '@/lib/router';
import type { LookupResult, Operator } from '@/types';

interface Props {
  onContinue: (data: {
    phone: string;
    country: LookupResult['country'];
    operator: Operator | null;
    nationalNumber: string;
  }) => void;
}

export function HomePage({ onContinue }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white">
      {/* Hero */}
      <section className="relative pt-24 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-100 rounded-full blur-3xl opacity-40 -translate-y-1/4 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-100 rounded-full blur-3xl opacity-30 translate-y-1/4 -translate-x-1/4" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm mb-6 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
            <span className="text-sm font-medium text-gray-600">Live in 80+ countries</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight animate-fade-in-up">
            Send mobile recharge
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-brand-800 bg-clip-text text-transparent">
              anywhere in the world
            </span>
          </h1>

          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            Enter your recipient's phone number and we'll detect their country and operator automatically. Fast, secure, and easy international airtime top-up.
          </p>

          {/* Phone lookup */}
          <div className="mt-10 max-w-xl mx-auto text-left animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <PhoneLookup onContinue={onContinue} />
          </div>
        </div>
      </section>

      {/* Trust indicators */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 border-y border-gray-100">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { icon: Globe, value: '80+', label: 'Countries' },
            { icon: Zap, value: 'Instant', label: 'Delivery' },
            { icon: Shield, value: 'Secure', label: 'Payment' },
            { icon: Users, value: '24/7', label: 'Support' },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="inline-flex w-12 h-12 rounded-xl bg-brand-50 items-center justify-center mb-3">
                <item.icon className="w-6 h-6 text-brand-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900 font-display">{item.value}</div>
              <div className="text-sm text-gray-500">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-gray-900 text-center mb-4">
            How it works
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Sending international mobile recharge takes less than a minute.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Enter phone number',
                desc: 'Type the recipient number with the country code. We detect the country and operator automatically.',
                icon: Smartphone,
              },
              {
                step: '2',
                title: 'Choose a recharge',
                desc: 'Pick from available recharge amounts. Prices are shown in your currency with no hidden fees.',
                icon: Zap,
              },
              {
                step: '3',
                title: 'Pay securely',
                desc: 'Complete payment with Stripe or PIX (in Brazil). The recharge is delivered instantly after confirmation.',
                icon: Shield,
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center mb-4">
                    <span className="text-white font-bold text-lg">{item.step}</span>
                  </div>
                  <h3 className="font-display font-bold text-lg text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-gray-900 text-center mb-12">
            Why choose Global TopUp
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: CheckCircle2, title: 'Automatic detection', desc: 'We identify the country and mobile operator from the phone number — no manual lookup needed.' },
              { icon: Shield, title: 'Bank-grade security', desc: 'Payments processed through Stripe and Mercado Pago with webhook-verified confirmation.' },
              { icon: Clock, title: 'Instant delivery', desc: 'Recharges are submitted to the operator the moment payment is confirmed.' },
              { icon: Globe, title: 'Global coverage', desc: 'Send airtime to 80+ countries with real-time pricing from DingConnect.' },
            ].map((f, i) => (
              <div key={i} className="flex gap-4 p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-50 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-accent-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-600">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl font-bold text-gray-900 mb-4">
            Ready to send recharge?
          </h2>
          <p className="text-gray-600 mb-8">
            Get started in seconds — just enter your recipient's phone number.
          </p>
          <button
            onClick={() => navigate('/recharge')}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-brand-600 text-white font-semibold text-lg hover:bg-brand-700 transition-all shadow-lg shadow-brand-200 active:scale-[0.99]"
          >
            Start now <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>
    </div>
  );
}


