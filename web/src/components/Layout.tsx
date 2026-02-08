import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChatWidget, ChatWidgetFAB } from './ChatWidget';

const tabs = [
  { path: '/', label: 'Meal Plans' },
  { path: '/recipes', label: 'Recipes' },
  { path: '/schedule', label: 'Schedule' },
  { path: '/preferences', label: 'Preferences' },
] as const;

export function Layout() {
  const { user, logout } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-soft">
        <h1 className="font-serif text-xl font-bold">
          Cookin<span className="text-accent">'</span>
        </h1>

        <div className="flex items-center gap-3">
          {user?.picture && (
            <img
              src={user.picture}
              alt=""
              className="w-8 h-8 rounded-full"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="text-sm text-muted hidden sm:inline">
            {user?.name || user?.email}
          </span>
          <button
            onClick={logout}
            className="text-xs text-muted hover:text-text transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex border-b border-border bg-bg-soft">
        {tabs.map(({ path, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-text'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>

      {/* Chat Widget */}
      <ChatWidget isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      {!isChatOpen && <ChatWidgetFAB onClick={() => setIsChatOpen(true)} />}
    </div>
  );
}
