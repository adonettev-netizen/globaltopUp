import { Globe2, Shield, Mail } from 'lucide-react';
import { navigate } from '@/lib/router';

export function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <Globe2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-bold text-white">Global TopUp</span>
            </div>
            <p className="text-sm leading-relaxed">
              Send mobile recharge to family and friends worldwide. Fast, secure, and reliable international airtime top-up.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => navigate('/recharge')} className="hover:text-white transition-colors">
                  Send recharge
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/track')} className="hover:text-white transition-colors">
                  Track order
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/how-it-works')} className="hover:text-white transition-colors">
                  How it works
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Support</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => navigate('/support')} className="hover:text-white transition-colors">
                  Help center
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">
                  Terms of service
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/privacy')} className="hover:text-white transition-colors">
                  Privacy policy
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/refunds')} className="hover:text-white transition-colors">
                  Refund policy
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Security</h4>
            <div className="flex items-center gap-2 text-sm mb-3">
              <Shield className="w-4 h-4 text-accent-400" />
              <span>PCI-DSS compliant payments</span>
            </div>
            <div className="flex items-center gap-2 text-sm mb-3">
              <Mail className="w-4 h-4 text-accent-400" />
              <span>support@globaltopup.com</span>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs">© {new Date().getFullYear()} Global TopUp. All rights reserved.</p>
          <p className="text-xs">Powered by DingConnect, Stripe, and Mercado Pago</p>
        </div>
      </div>
    </footer>
  );
}
