import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
        };
        oauth2: {
          initCodeClient: (config: Record<string, unknown>) => { requestCode: () => void };
        };
      };
    };
  }
}

export function LoginPage() {
  const { login } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);

  const handleCredentialResponse = useCallback(
    (response: { credential: string }) => {
      login(response.credential);
    },
    [login]
  );

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: __GOOGLE_CLIENT_ID__,
        callback: handleCredentialResponse,
      });
      if (buttonRef.current) {
        window.google?.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          width: 280,
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [handleCredentialResponse]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="font-serif text-5xl font-bold mb-3">
          Cookin<span className="text-accent">'</span>
        </h1>
        <p className="text-muted text-lg mb-10">
          Your personal assistant for all your cooking needs.
        </p>

        <div className="bg-card rounded-2xl border border-border p-8 mb-6">
          <p className="text-sm text-muted mb-6">Sign in to get started</p>
          <div ref={buttonRef} className="flex justify-center" />
        </div>

        <p className="text-xs text-muted">
          Plan meals, track preferences, and get personalized recipes — all through chat.
        </p>
      </div>
    </div>
  );
}
