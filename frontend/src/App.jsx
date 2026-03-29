import { useState, useEffect } from 'react';
import HomePage from './components/HomePage';
import SessionRoom from './components/SessionRoom';
import { generateDeskId } from './utils/deskId';

export default function App() {
  const [deskId, setDeskId] = useState('');
  const [session, setSession] = useState(null); // { roomId, role: 'host'|'viewer', remoteDeskId }
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    // Persist desk ID in localStorage
    let id = localStorage.getItem('clouddesk-id');
    if (!id) {
      id = generateDeskId();
      localStorage.setItem('clouddesk-id', id);
    }
    setDeskId(id);
  }, []);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const startSession = (sessionData) => {
    setSession(sessionData);
  };

  const endSession = () => {
    setSession(null);
    showNotification('Session ended', 'info');
  };

  return (
    <div className="h-full bg-dark-950 text-dark-100 font-sans flex flex-col">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 toast px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2
          ${notification.type === 'error' ? 'bg-red-900/80 text-red-200 border border-red-700' :
            notification.type === 'success' ? 'bg-green-900/80 text-green-200 border border-green-700' :
            'bg-dark-700 text-dark-100 border border-dark-600'}`}>
          <span>{notification.msg}</span>
        </div>
      )}

      {session ? (
        <SessionRoom
          deskId={deskId}
          session={session}
          onEnd={endSession}
          onNotify={showNotification}
        />
      ) : (
        <HomePage
          deskId={deskId}
          onStartSession={startSession}
          onNotify={showNotification}
        />
      )}
    </div>
  );
}
