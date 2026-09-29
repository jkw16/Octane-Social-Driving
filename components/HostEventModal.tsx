import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Meetup } from '../types';

interface HostEventModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (event: Meetup) => void;
}

/**
 * Shared "Host an Event" form used by both the Dashboard (Home) and the
 * Car Meets screen. Owns its own form state and calls `onSubmit` with a
 * fully-formed Meetup when the user starts the event.
 */
export const HostEventModal: React.FC<HostEventModalProps> = ({ open, onClose, onSubmit }) => {
  const [form, setForm] = useState({ title: '', location: '', type: 'Chill' as Meetup['type'] });

  if (!open) return null;

  const handleSubmit = () => {
    if (!form.title.trim() || !form.location.trim()) return;
    onSubmit({
      id: `e-${Date.now()}`,
      title: form.title.trim(),
      location: form.location.trim(),
      time: 'Happening now',
      attendees: 1,
      type: form.type,
      // Default to a point near the user's mock location (Downtown LA).
      lat: 34.0522 + (Math.random() - 0.5) * 0.02,
      lng: -118.2437 + (Math.random() - 0.5) * 0.02,
      description: 'Hosted just now. Join in before it rolls out.'
    });
    setForm({ title: '', location: '', type: 'Chill' });
    onClose();
  };

  return (
    <div
      /* Responsive: pt-safe/pb-safe lift the centered dialog above the
         Dynamic Island and home indicator; .octane-modal-panel (index.css)
         sizes the panel to the inset-aware viewport (was max-h-[90vh]). */
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pt-safe pb-safe"
      onClick={onClose}
    >
      <div
        className="bg-octane-dark w-full max-w-md rounded-2xl border border-white/10 p-5 animate-in slide-in-from-bottom-4 duration-300 octane-modal-panel overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-display font-bold text-white">Host an Event</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
                <X className="w-5 h-5" />
            </button>
        </div>
        <div className="space-y-3">
            <div>
                <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Event Name</label>
                <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Nightfall Canyon Run"
                    className="w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-octane-accent"
                />
            </div>
            <div>
                <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Location</label>
                <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. Canyon Cafe"
                    className="w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-octane-accent"
                />
            </div>
            <div>
                <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Type</label>
                <div className="flex gap-2">
                    {(['Chill', 'Race', 'Show'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setForm(f => ({ ...f, type: t }))}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                                form.type === t
                                    ? 'bg-white text-octane-black border-white'
                                    : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>
        </div>
        <button
            onClick={handleSubmit}
            disabled={!form.title.trim() || !form.location.trim()}
            className="w-full mt-5 bg-octane-accent text-black font-bold py-3 rounded-lg hover:bg-octane-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
            Start Event
        </button>
      </div>
    </div>
  );
};