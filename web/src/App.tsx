import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { ChatPage } from './components/ChatPage';
import { MealPlansPage } from './components/MealPlansPage';
import { RecipesPage } from './components/RecipesPage';
import { SchedulePage } from './components/SchedulePage';
import { PreferencesPage } from './components/PreferencesPage';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ChatPage />} />
        <Route path="/meals" element={<MealPlansPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/preferences" element={<PreferencesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
