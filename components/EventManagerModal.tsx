import React, { useEffect, useState } from 'react';
import { X, Save, Flag, Trash2, MapPin, RotateCcw, Archive } from 'lucide-react';
import { Meetup } from '../types';

interface EventManagerModalProps {
  open: boolean;
  onClose: () => void;
  hostedEvents: Meetup[];
  pastEvents: Meetup[];
  onUpdate: (event: Meetup) => void;
  onEnd: (eventId: string) => void;       // archive an active event
  onDelete: (eventId: string) => void;     // permanently delete an active event
  onRestore: (eventId: string) => void;     // move an archived event back to live
  onDeletePast: (eventId: string) => void;  // permanently delete an archived event
  initialTab?: 'active' | 'past';
}

/**
 * Host-only manager for events the current user created. Two tabs:
 *  - Active: edit details, End (move to archive), or Delete (permanent).
 *  - Past: archived events — Restore (back to live) or Delete (permanent).
 *
 * When the host has more than one active event, a selector switches between
 * them. End != Delete: End preserves the event in the archive, Delete is gone.
 */
export const EventManagerModal: React.FC<EventManagerModalProps> = ({
  open, onClose, hostedEvents, pastEvents, onUpdate, onEnd, onDelete, onRestore, onDeletePast, initialTab = 'active'
}) => {
  const [tab, setTab] = useState<'active' | 'past'>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(hostedEvents[0]?.id ?? null);
  const [form, setForm] = useState({ title: '', location: '', type: 'Chill' as Meetup['type'] });

  // Follow the tab the opener asked for each time the modal opens.
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  // Keep the selected active event + form in sync with the hosted list.
  useEffect(() => {
    if (!open) return;
    const first = hostedEvents[0];
    if (!first) { setSelectedId(null); return; }
    setSelectedId((prev) => (hostedEvents.some((e) => e.id === prev) ? prev : first.id));
  }, [open, hostedEvents]);

  useEffect(() => {
    if (!open) return;
    const sel = hostedEvents.find((e) => e.id === selectedId);
    if (sel) setForm({ title: sel.title, location: sel.location, type: sel.type });
    // Intentionally NOT depending on `hostedEvents`: the parent passes a fresh
    // filtered array every render, so including it here would re-fire this
    // effect on any unrelated re-render and overwrite the host's in-progress
    // edits with the stored values. We only re-sync on open / selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId]);

  if (!open) return null;

  const selected = hostedEvents.find((e) => e.id === selectedId);

  const handleSave = () => {
    if (!selected || !form.title.trim() || !form.location.trim()) return;
    onUpdate({
      ...selected,
      title: form.title.trim(),
      location: form.location.trim(),
      type: form.type
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-octane-dark w-full max-w-md rounded-2xl border border-white/10 p-5 animate-in slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-display font-bold text-white">Manage Events</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('active')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
              tab === 'active' ? 'bg-white text-octane-black border-white' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
            }`}
          >
            Active ({hostedEvents.length})
          </button>
          <button
            onClick={() => setTab('past')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1 ${
              tab === 'past' ? 'bg-white text-octane-black border-white' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
            }`}
          >
            <Archive className="w-3 h-3" /> Past ({pastEvents.length})
          </button>
        </div>

        {tab === 'active' ? (
          hostedEvents.length === 0 ? (
            <p className="text-gray-500 text-sm py-6 text-center">No active events you're hosting.</p>
          ) : (
            <>
              {/* Event selector (only when more than one) */}
              {hostedEvents.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-3 -mt-1">
                  {hostedEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ${
                        e.id === selectedId
                          ? 'bg-white text-octane-black border-white'
                          : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              )}

              {selected && (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Event Name</label>
                      <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        className="w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-octane-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-bold uppercase mb-1 block flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Location
                      </label>
                      <input
                        type="text"
                        value={form.location}
                        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                        className="w-full bg-octane-black border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-octane-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Type</label>
                      <div className="flex gap-2">
                        {(['Chill', 'Race', 'Show'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setForm((f) => ({ ...f, type: t }))}
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
                    onClick={handleSave}
                    disabled={!form.title.trim() || !form.location.trim()}
                    className="w-full mt-5 bg-octane-accent text-black font-bold py-3 rounded-lg hover:bg-octane-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" /> Save Changes
                  </button>

                  {/* Take-down actions: End (archive) vs Delete (permanent) */}
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => onEnd(selected.id)}
                      className="py-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/40 font-bold text-sm rounded-lg hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <Flag className="w-4 h-4" /> End Event
                    </button>
                    <button
                      onClick={() => onDelete(selected.id)}
                      className="py-2.5 bg-red-500/10 text-red-400 border border-red-500/40 font-bold text-sm rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-2 text-center leading-snug">
                    End moves the event to your archive (Past tab); Delete permanently removes it.
                  </p>
                </>
              )}
            </>
          )
        ) : (
          /* Past (archive) tab */
          pastEvents.length === 0 ? (
            <p className="text-gray-500 text-sm py-6 text-center">No archived events. End an active event to save it here.</p>
          ) : (
            <div className="space-y-2">
              {pastEvents.map((e) => (
                <div key={e.id} className="bg-octane-black/50 rounded-xl border border-white/5 p-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-white truncate">{e.title}</h4>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{e.location}</span>
                    </p>
                    <p className="text-[10px] text-gray-600 mt-1">Ended {e.endedAt ?? 'earlier'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => onRestore(e.id)}
                      className="py-2 bg-octane-accent/10 text-octane-accent border border-octane-accent/40 font-bold text-xs rounded-lg hover:bg-octane-accent/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                    <button
                      onClick={() => onDeletePast(e.id)}
                      className="py-2 bg-red-500/10 text-red-400 border border-red-500/40 font-bold text-xs rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};