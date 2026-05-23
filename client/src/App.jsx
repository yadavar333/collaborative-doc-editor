import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext, AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import Editor from './components/Editor.jsx';
import { v4 as uuidv4 } from 'uuid';

const ANON_USER_ID = uuidv4(); // fallback for unauthenticated demo

function ProtectedRoute({ children }) {
  const { token } = useContext(AuthContext);
  return token ? children : <Navigate to="/login" replace />;
}

function EditorRoute() {
  const { token, user } = useContext(AuthContext);
  const params = new URLSearchParams(location.search);
  const docId  = location.pathname.split('/doc/')[1];
  return (
    <Editor
      documentId={docId}
      userId={user?.id || ANON_USER_ID}
      authToken={token}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"   element={<Auth />} />
          <Route path="/"        element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/doc/:id" element={<ProtectedRoute><EditorRoute /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
