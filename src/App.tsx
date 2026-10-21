import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useRouter } from '@/lib/router';
import { HomePage } from '@/pages/HomePage';
import { RechargePage } from '@/pages/RechargePage';
import { TrackOrderPage } from '@/pages/TrackOrderPage';
import { ConfirmationPage } from '@/pages/ConfirmationPage';
import { AdminPage } from '@/pages/AdminPage';
import { HowItWorksPage, SupportPage, TermsPage, PrivacyPage, RefundsPage } from '@/pages/InfoPages';
import type { LookupResult, Operator } from '@/types';

type PhoneData = {
  phone: string;
  country: LookupResult['country'];
  operator: Operator | null;
  nationalNumber: string;
} | null;

function App() {
  const { route } = useRouter();
  const [phoneData, setPhoneData] = useState<PhoneData>(null);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  const renderPage = () => {
    switch (route.path) {
      case '/':
        return (
          <HomePage
            onContinue={(data) => {
              setPhoneData(data as PhoneData);
              window.location.hash = '/recharge';
            }}
          />
        );

      case '/recharge':
        return (
          <RechargePage
            initialPhoneData={phoneData}
            onOrderCreated={(orderRef, accessToken) => {
              setPhoneData(null);
              window.location.hash = `/confirmation?ref=${orderRef}&token=${accessToken}`;
            }}
          />
        );

      case '/track':
        return <TrackOrderPage />;

      case '/confirmation': {
        const ref = route.params.ref;
        const token = route.params.token;
        if (!ref || !token) return <TrackOrderPage />;
        return <ConfirmationPage orderRef={ref} accessToken={token} />;
      }

      case '/admin':
        return <AdminPage />;

      case '/how-it-works':
        return <HowItWorksPage />;

      case '/support':
        return <SupportPage />;

      case '/terms':
        return <TermsPage />;

      case '/privacy':
        return <PrivacyPage />;

      case '/refunds':
        return <RefundsPage />;

      default:
        return <HomePage onContinue={() => { setPhoneData(null); window.location.hash = '/recharge'; }} />;
    }
  };

  const showHeaderFooter = route.path !== '/confirmation';

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {showHeaderFooter && <Header activePath={route.path} />}
      <main className="flex-1">{renderPage()}</main>
      {showHeaderFooter && <Footer />}
    </div>
  );
}

export default App;
