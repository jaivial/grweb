import { useState } from 'react';
import { api } from '../utils/api';

export default function Checkout() {
  const [quantity, setQuantity] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    surname: '',
    email: '',
    instagram: '',
    followConfirmed: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const pricePerTicket = 0.50;
  const totalPrice = (quantity * pricePerTicket).toFixed(2);

  const handleQuantityChange = (delta: number) => {
    const newQuantity = Math.max(1, Math.min(100, quantity + delta));
    setQuantity(newQuantity);
  };

  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setFormData({ ...formData, [target.name]: target.value });
    // Clear error when user starts typing
    if (errors[target.name]) {
      setErrors({ ...errors, [target.name]: '' });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.surname.trim()) {
      newErrors.surname = 'Surname is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.instagram.trim()) {
      newErrors.instagram = 'Instagram username is required';
    } else if (!formData.instagram.startsWith('@')) {
      newErrors.instagram = 'Instagram username must start with @';
    }

    if (!formData.followConfirmed) {
      newErrors.followConfirmed = 'Please confirm you follow @grstrength';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const response = await api.buyTickets({
        firstName: formData.firstName,
        surname: formData.surname,
        email: formData.email,
        instagram: formData.instagram,
        ticketCount: quantity,
      });

      // Redirect to Stripe Checkout
      window.location.href = response.url;
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : 'Failed to process payment. Please try again.',
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-base py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Get Your Tickets</h1>
          <p className="text-zinc-400">Join the GR Cup 2026 Raffle</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ticket Quantity Selector */}
          <div className="bg-dark-card rounded-lg p-6 border border-zinc-800">
            <label className="block text-sm font-medium text-zinc-300 mb-4">
              Number of Tickets
            </label>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleQuantityChange(-1)}
                disabled={quantity <= 1}
                className="w-12 h-12 rounded-lg bg-dark-surface text-white text-2xl font-bold hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                −
              </button>
              <div className="text-center">
                <div className="text-5xl font-bold text-red-accent">{quantity}</div>
                <div className="text-sm text-zinc-400 mt-1">
                  {quantity === 1 ? 'ticket' : 'tickets'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleQuantityChange(1)}
                disabled={quantity >= 100}
                className="w-12 h-12 rounded-lg bg-dark-surface text-white text-2xl font-bold hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                +
              </button>
            </div>
            <div className="mt-4 pt-4 border-t border-zinc-700 text-center">
              <div className="text-sm text-zinc-400">Total Price</div>
              <div className="text-3xl font-bold text-dark-red">{totalPrice}€</div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="bg-dark-card rounded-lg p-6 border border-zinc-800 space-y-4">
            <h2 className="text-lg font-semibold text-white mb-4">Your Information</h2>

            {/* First Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                First Name
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onInput={handleInputChange}
                className={`w-full px-4 py-3 bg-dark-surface border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-accent transition-colors ${
                  errors.firstName ? 'border-red-500' : 'border-zinc-700'
                }`}
                placeholder="John"
              />
              {errors.firstName && (
                <p className="mt-1 text-sm text-red-400">{errors.firstName}</p>
              )}
            </div>

            {/* Surname */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Surname
              </label>
              <input
                type="text"
                name="surname"
                value={formData.surname}
                onInput={handleInputChange}
                className={`w-full px-4 py-3 bg-dark-surface border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-accent transition-colors ${
                  errors.surname ? 'border-red-500' : 'border-zinc-700'
                }`}
                placeholder="Doe"
              />
              {errors.surname && (
                <p className="mt-1 text-sm text-red-400">{errors.surname}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onInput={handleInputChange}
                className={`w-full px-4 py-3 bg-dark-surface border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-accent transition-colors ${
                  errors.email ? 'border-red-500' : 'border-zinc-700'
                }`}
                placeholder="john@example.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Instagram */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Instagram Username
              </label>
              <input
                type="text"
                name="instagram"
                value={formData.instagram}
                onInput={handleInputChange}
                className={`w-full px-4 py-3 bg-dark-surface border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-accent transition-colors ${
                  errors.instagram ? 'border-red-500' : 'border-zinc-700'
                }`}
                placeholder="@yourusername"
              />
              {errors.instagram && (
                <p className="mt-1 text-sm text-red-400">{errors.instagram}</p>
              )}
            </div>
          </div>

          {/* Instagram Follow Confirmation */}
          <div className="bg-dark-card rounded-lg p-6 border border-zinc-800">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.followConfirmed}
                onChange={(e) => {
                  const target = e.target as HTMLInputElement;
                  setFormData({ ...formData, followConfirmed: target.checked });
                  if (errors.followConfirmed) {
                    setErrors({ ...errors, followConfirmed: '' });
                  }
                }}
                className="mt-1 w-5 h-5 rounded border-zinc-700 bg-dark-surface text-red-accent focus:ring-red-accent focus:ring-offset-dark-base"
              />
              <span className="text-sm text-zinc-300">
                I confirm that I follow{' '}
                <a
                  href="https://instagram.com/grstrength"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-accent hover:text-dark-red transition-colors font-semibold"
                >
                  @grstrength
                </a>{' '}
                on Instagram
              </span>
            </label>
            {errors.followConfirmed && (
              <p className="mt-2 text-sm text-red-400">{errors.followConfirmed}</p>
            )}
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
              <p className="text-sm text-red-400">{errors.submit}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-6 bg-gradient-to-r from-red-accent to-dark-red text-white font-bold text-lg rounded-lg hover:scale-105 hover:shadow-red-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              `Pay ${totalPrice}€ with Stripe`
            )}
          </button>

          {/* Security Note */}
          <p className="text-xs text-zinc-500 text-center">
            🔒 Secure payment powered by Stripe. Your payment information is encrypted.
          </p>
        </form>
      </div>
    </div>
  );
}
