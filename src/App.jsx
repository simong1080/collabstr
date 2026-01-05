import React, { useState, useEffect } from 'react';
import { FileText, Key, Plus, Clock, Users } from 'lucide-react';
import NDK from '@nostr-dev-kit/ndk';
import * as Y from 'yjs';
import { NostrProvider } from '@hocuspocus/provider-nostr';
import { v4 as uuidv4 } from 'uuid';

const defaultRelays = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social'];

const ndk = new NDK({ explicitRelayUrls: defaultRelays });
ndk.connect();

function App() {
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [ydoc, setYdoc] = useState(null);
  const [provider, setProvider] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [nsec, setNsec] = useState('');
  const [bunker, setBunker] = useState('');

  // Login functions (NIP-07, nsec, bunker/NIP-46)
  const loginNip07 = async () => {
    if (!window.nostr) return alert('No NIP-07 extension');
    const pubkey = await window.nostr.getPublicKey();
    setUser({ pubkey, signer: 'nip07' });
  };

  const loginNsec = async () => {
    // Use NDK private key signer — implement carefully (never log nsec)
    // For brevity, assume you add proper handling
    alert('nsec login placeholder — implement with NDKPrivateKeySigner');
  };

  const loginBunker = async () => {
    alert('Bunker/NIP-46 placeholder');
  };

  const createDoc = async () => {
    if (!user || !newTitle) return;
    const docId = uuidv4();
    // Publish a "room" event or just use docId — Yjs provider handles sync
    setCurrentDocId(docId);
    setNewTitle('');
  };

  useEffect(() => {
    if (currentDocId && user) {
      const doc = new Y.Doc();
      const text = doc.getText('content');

      const prov = new NostrProvider({
        ydoc: doc,
        relays: defaultRelays,
        room: currentDocId,
        privateKey: user.privateKey || undefined, // if using nsec
        // NIP-07 signing via custom signer if needed
      });

      setYdoc(doc);
      setProvider(prov);

      return () => prov.destroy();
    }
  }, [currentDocId, user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-lg p-8 border border-white/20">
          <FileText className="w-16 h-16 text-purple-400 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white text-center mb-6">Nostr Docs</h1>
          <button onClick={loginNip07} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 ... flex items-center justify-center gap-3">
            <Key className="w-5 h-5" /> Sign in with NIP-07
          </button>
          {/* Add nsec and bunker inputs/buttons similarly */}
          <button className="w-full bg-white/20 ... mt-4">Demo Mode (ephemeral key)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white">Nostr Collaborative Docs</h1>
        <p className="text-purple-200">Signed in: {user.pubkey.slice(0,10)}...</p>

        <div className="flex gap-4 mt-6">
          <input placeholder="New document title" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="p-2 rounded" />
          <button onClick={createDoc} className="bg-green-500 text-white px-4 py-2 rounded flex items-center gap-2"><Plus /> Create</button>
        </div>

        {ydoc && (
          <div className="mt-8 bg-white/10 backdrop-blur rounded-lg p-6">
            <h2 className="text-2xl text-white mb-4">Editing: {currentDocId}</h2>
            <div className="prose prose-invert max-w-none">
              {/* Simple binding example — replace with Tiptap or Quill for rich text */}
              <textarea
                className="w-full h-96 bg-white/5 text-white p-4 rounded"
                value={ydoc.getText('content').toString()}
                onChange={e => ydoc.getText('content').insert(0, e.target.value)} // Basic — use proper binding in production
              />
            </div>
            <p className="text-purple-300 mt-4">Connected users: {provider?.awareness.getStates().size || 1}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
