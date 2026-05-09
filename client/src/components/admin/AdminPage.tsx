import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';

export const ADMIN_TOKEN_KEY = 'hf_admin_token';

export function AdminPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect immediately
  useEffect(() => {
    if (localStorage.getItem(ADMIN_TOKEN_KEY)) {
      navigate('/', { replace: true });
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error('Invalid password');
        return;
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      navigate('/', { replace: true });
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-felt-texture flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-felt-800 border border-felt-600 rounded-2xl p-8"
      >
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-white">Admin Login</h1>
          <p className="text-felt-400 text-sm mt-1">Hand &amp; Foot Management</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-felt-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full bg-felt-700 border border-felt-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold-500"
              autoFocus
            />
          </div>
          <Button type="submit" variant="gold" className="w-full" size="lg" loading={loading}>
            Login
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
