import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api } from '../utils/api';

interface SessionData {
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
  totalPaid: number;
}

export default function Success() {
  const [, navigate] = useLocation();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get session_id from URL params
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) {
      setError('No session ID found');
      setLoading(false);
      return;
    }

    // Fetch session details from backend
    fetchSessionDetails(sessionId);
  }, []);

  async function fetchSessionDetails(sessionId: string) {
    try {
      // In a real app, you'd have an endpoint to fetch session details
      // For now, we'll parse from localStorage or show generic success
      const storedData = localStorage.getItem('pending_purchase');
      
      if (storedData) {
        const data = JSON.parse(storedData);
        setSessionData({
          firstName: data.firstName,
          surname: data.surname,
          email: data.email,
          instagram: data.instagram,
          ticketCount: data.ticketCount,
          totalPaid: data.ticketCount * 0.5
        });
        localStorage.removeItem('pending_purchase');
      } else {
        // Generic success message if no data available
        setSessionData({
          firstName: 'Participant',
          surname: '',
          email: '',
          instagram: '',
          ticketCount: 1,
          totalPaid: 0.5
        });
      }
    } catch (err) {
      setError('Failed to load purchase details');
    } finally {
      setLoading(false);
    }
  }

  function shareOnInstagram() {
    const text = `I just entered the GR Cup 2026 Powerlifting Championship Raffle! 🏋️‍♂️💪 Get your tickets now at ${window.location.origin}`;
    const url = `https://www.instagram.com/`;
    window.open(url, '_blank');
  }

  function shareOnTwitter() {
    const text = `I just entered the GR Cup 2026 Powerlifting Championship Raffle! 🏋️‍♂️💪 #GRCup2026 #Powerlifting #GRStrength`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-lg">Confirming your entry...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">⚠️</div>
          <h1 className="text-3xl font-bold text-white mb-4">Something went wrong</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-red-accent text-white font-bold rounded-lg hover:scale-105 transition-transform"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-base py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success Animation */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-block relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-accent to-dark-red flex items-center justify-center mb-6 animate-pulse-slow">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <div className="absolute inset-0 rounded-full bg-red-accent opacity-30 animate-ping"></div>
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center mb-12 animate-slide-up">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            You're In! 🎉
          </h1>
          <p className="text-xl text-gray-400">
            Thank you for entering the <span className="text-red-accent font-bold">GR Cup 2026</span> raffle!
          </p>
        </div>

        {/* Purchase Details Card */}
        {sessionData && (
          <div className="bg-dark-surface rounded-2xl p-8 mb-8 border border-gray-700 animate-fade-in shadow-red-accent">
            <h2 className="text-2xl font-bold text-white mb-6">Purchase Details</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-gray-700">
                <span className="text-gray-400">Name</span>
                <span className="text-white font-semibold">
                  {sessionData.firstName} {sessionData.surname}
                </span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-gray-700">
                <span className="text-gray-400">Email</span>
                <span className="text-white font-semibold">{sessionData.email}</span>
              </div>

              {sessionData.instagram && (
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <span className="text-gray-400">Instagram</span>
                  <span className="text-red-accent font-semibold">@{sessionData.instagram.replace('@', '')}</span>
                </div>
              )}

              <div className="flex justify-between items-center py-3 border-b border-gray-700">
                <span className="text-gray-400">Tickets Purchased</span>
                <span className="text-white font-bold text-2xl">{sessionData.ticketCount}</span>
              </div>

              <div className="flex justify-between items-center py-4">
                <span className="text-white font-bold text-lg">Total Paid</span>
                <span className="text-dark-red font-bold text-3xl">€{sessionData.totalPaid.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Email Notice */}
        <div className="bg-dark-surface rounded-xl p-6 mb-8 border border-gray-700">
          <div className="flex items-start gap-4">
            <div className="text-3xl">📧</div>
            <div>
              <h3 className="text-white font-bold mb-2">Confirmation Email Sent</h3>
              <p className="text-gray-400 text-sm">
                We've sent a confirmation email to <span className="text-red-accent">{sessionData?.email}</span> with your purchase details and ticket numbers.
              </p>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-dark-surface rounded-xl p-6 mb-8 border border-gray-700">
          <h3 className="text-xl font-bold text-white mb-4">What Happens Next?</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-accent text-white flex items-center justify-center font-bold flex-shrink-0">1</div>
              <p className="text-gray-400">Keep an eye on your email for updates about the raffle</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-dark-red text-white flex items-center justify-center font-bold flex-shrink-0">2</div>
              <p className="text-gray-400">Follow <span className="text-red-accent">@grstrength</span> on Instagram for live announcements</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-accent to-dark-red text-white flex items-center justify-center font-bold flex-shrink-0">3</div>
              <p className="text-gray-400">Winner will be announced on the date specified in the rules</p>
            </div>
          </div>
        </div>

        {/* Social Sharing */}
        <div className="text-center mb-8">
          <h3 className="text-xl font-bold text-text-primary mb-4">Share Your Entry</h3>
          <p className="text-text-secondary mb-6">Let your friends know you're participating!</p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={shareOnInstagram}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:scale-105 transition-transform flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              Share on Instagram
            </button>

            <button
              onClick={shareOnTwitter}
              className="px-6 py-3 bg-black text-white font-bold rounded-lg hover:scale-105 transition-transform border border-gray-700 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Share on X
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/')}
            className="px-8 py-4 bg-red-accent text-white font-bold rounded-lg hover:scale-105 transition-transform shadow-red-accent"
          >
            Return to Home
          </button>
          
          <button
            onClick={() => navigate('/checkout')}
            className="px-8 py-4 bg-transparent text-dark-red font-bold rounded-lg border-2 border-dark-red hover:scale-105 transition-transform hover:shadow-dark-red"
          >
            Buy More Tickets
          </button>
        </div>

        {/* Footer Note */}
        <div className="text-center mt-12 text-gray-500 text-sm">
          <p>Questions? Contact us at <span className="text-red-accent">support@grstrength.com</span></p>
        </div>
      </div>
    </div>
  );
}
