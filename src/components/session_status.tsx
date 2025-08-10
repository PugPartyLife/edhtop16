import React from 'react';
import { useSession } from '../lib/client/use_session';

interface SessionStatusProps {
  showDetails?: boolean;
  className?: string;
}

export function SessionStatus({ showDetails = false, className = '' }: SessionStatusProps) {
  const { 
    sessionData, 
    isAuthenticated, 
    isAdmin, 
    login, 
    logout 
  } = useSession();

  const handleLogin = async () => {
    const success = await login({ username: 'demo', password: 'demo' });
    if (success) {
      console.log('Logged in successfully!');
    } else {
      console.log('Login failed');
    }
  };

  const handleLogout = async () => {
    const success = await logout();
    if (success) {
      console.log('Logged out successfully!');
    }
  };

  if (!showDetails && !isAuthenticated) {
    return null; // Don't show anything for unauthenticated users unless details are requested
  }

  return (
    <div className={`session-status ${className}`}>
      {showDetails && (
        <div className="text-sm">
          <p>Status: {isAuthenticated ? 'Authenticated' : 'Guest'}</p>
          {isAuthenticated && (
            <>
              <p>User: {sessionData.userId}</p>
              {isAdmin && <p className="text-yellow-400">Admin</p>}
            </>
          )}
        </div>
      )}
      
      <div className="mt-2">
        {!isAuthenticated ? (
          <button 
            onClick={handleLogin}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Login
          </button>
        ) : (
          <button 
            onClick={handleLogout}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Logout
          </button>
        )}
      </div>
    </div>
  );
}
