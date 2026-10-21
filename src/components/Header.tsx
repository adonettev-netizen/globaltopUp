import { useState, useEffect } from 'react';
import { Globe2, Menu, X } from 'lucide-react';
import { navigate } from '@/lib/router';

export function Header({ activePath }: { activePath?: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLink = (label: string, path: string) => {
    const isActive = activePath === path;
    return (
      <button
        onClick={() => {
          navigate(path);
          setMobileOpen(false);
        }}
        className={`text-sm font-medium transition-colors ${
          isActive ? 'text-brand-700' : 'text-gray-600 hover:text-brand-700'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-100'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <Globe2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-lg text-gray-900">
              Global TopUp
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-8">
            {navLink('Recharge', '/')}
            {navLink('How it works', '/how-it-works')}
            {navLink('Track order', '/track')}
            {navLink('Support', '/support')}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="text-sm font-medium text-gray-600 hover:text-brand-700 transition-colors"
            >
              Admin
            </button>
            <button
              onClick={() => navigate('/recharge')}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm"
            >
              Send recharge
            </button>
          </div>

          <button
            className="md:hidden p-2 text-gray-600"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden py-4 border-t border-gray-100 animate-slide-in">
            <div className="flex flex-col gap-4">
              {navLink('Recharge', '/')}
              {navLink('How it works', '/how-it-works')}
              {navLink('Track order', '/track')}
              {navLink('Support', '/support')}
              <button
                onClick={() => {
                  navigate('/admin');
                  setMobileOpen(false);
                }}
                className="text-sm font-medium text-gray-600 text-left"
              >
                Admin
              </button>
              <button
                onClick={() => {
                  navigate('/recharge');
                  setMobileOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold text-center"
              >
                Send recharge
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
