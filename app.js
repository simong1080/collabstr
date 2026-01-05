import React, { useState, useEffect } from 'https://esm.sh/react@18';
import ReactDOM from 'https://esm.sh/react-dom@18/client';
import * as Icons from 'https://esm.sh/lucide-react@0.263.1';

import React, { useState, useEffect } from 'react';
import { Key, LogIn, Wifi, WifiOff, Plus, Trash2, X, Edit, Send, Users, FileText, Clock, Check, AlertCircle } from 'lucide-react';

// Nostr utilities
const generateKeyPair = () => {
  const randomHex = () => Array.from({length: 32}, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
  return { publicKey: randomHex(), privateKey: randomHex() };
};

const createEvent = (kind, content, tags, pubkey) => ({
  kind,
  pubkey,
  created_at: Math.floor(Date.now() / 1000),
  tags,
  content,
  id: Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
  sig: Array.from({length: 128}, () => Math.floor(Math.random() * 16).toString(16)).join('')
});

const POPULAR_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social'
];

const App = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authMethod, setAuthMethod] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showRelayModal, setShowRelayModal] = useState(false);
  
  // Auth states
  const [hasNip07, setHasNip07] = useState(false);
  const [manualPrivKey, setManualPrivKey] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [bunkerConnecting, setBunkerConnecting] = useState(false);
  
  // Relay states
  const [relays, setRelays] = useState([
    { url: 'wss://relay.damus.io', status: 'connected', read: true, write: true },
    { url: 'wss://relay.nostr.band', status: 'connected', read: true, write: true }
  ]);
  const [newRelayUrl, setNewRelayUrl] = useState('');
  
  // App states
  const [document, setDocument] = useState({
    id: 'doc-001',
    content: '# Welcome to Collaborative Docs\n\nThis is a decentralized document.',
    title: 'My First Document',
    ownerPubkey: null
  });
  const [proposals, setProposals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('document');

  useEffect(() => {
    setHasNip07(!!window.nostr);
    if (window.nostr) addLog('✅ NIP-07 extension detected');
  }, []);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);
  };

  // AUTH METHODS
  const signInNip07 = async () => {
    try {
      const pubkey = await window.nostr.getPublicKey();
      setCurrentUser({
        publicKey: pubkey,
        name: `User (${pubkey.slice(0, 8)}...)`,
        authMethod: 'nip07'
      });
      setShowAuthModal(false);
      addLog(`🔐 Signed in via NIP-07: ${pubkey.slice(0, 8)}...`, 'success');
      if (!document.ownerPubkey) setDocument(prev => ({ ...prev, ownerPubkey: pubkey }));
    } catch (err) {
      alert('NIP-07 sign in failed: ' + err.message);
    }
  };

  const signInPrivateKey = () => {
    if (!manualPrivKey || manualPrivKey.length !== 64) {
      alert('Enter valid 64-char hex private key');
      return;
    }
    const pubkey = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setCurrentUser({
      publicKey: pubkey,
      privateKey: manualPrivKey,
      name: `User (${pubkey.slice(0, 8)}...)`,
      authMethod: 'privkey'
    });
    setShowAuthModal(false);
    setManualPrivKey('');
    addLog(`🔐 Signed in with private key: ${pubkey.slice(0, 8)}...`, 'success');
    if (!document.ownerPubkey) setDocument(prev => ({ ...prev, ownerPubkey: pubkey }));
  };

  const signInBunker = async () => {
    if (!bunkerUri.startsWith('bunker://')) {
      alert('Bunker URI must start with bunker://');
      return;
    }
    setBunkerConnecting(true);
    addLog('🔌 Connecting to Nostr Bunker...', 'info');
    
    // Simulate bunker connection
    setTimeout(() => {
      const pubkey = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setCurrentUser({
        publicKey: pubkey,
        name: `User (${pubkey.slice(0, 8)}...)`,
        authMethod: 'bunker',
        bunkerUri
      });
      setBunkerConnecting(false);
      setShowAuthModal(false);
      setBunkerUri('');
      addLog(`🔐 Connected to Bunker: ${pubkey.slice(0, 8)}...`, 'success');
      if (!document.ownerPubkey) setDocument(prev => ({ ...prev, ownerPubkey: pubkey }));
    }, 2000);
  };

  // RELAY MANAGEMENT
  const addRelay = () => {
    if (!newRelayUrl.startsWith('wss://') && !newRelayUrl.startsWith('ws://')) {
      alert('Relay must start with wss:// or ws://');
      return;
    }
    if (relays.some(r => r.url === newRelayUrl)) {
      alert('Relay already added');
      return;
    }
    
    const relay = { url: newRelayUrl, status: 'connecting', read: true, write: true };
    setRelays(prev => [...prev, relay]);
    addLog(`🔌 Connecting to ${newRelayUrl}...`);
    
    setTimeout(() => {
      setRelays(prev => prev.map(r => 
        r.url === newRelayUrl ? { ...r, status: 'connected' } : r
      ));
      addLog(`✅ Connected to ${newRelayUrl}`, 'success');
    }, 1000);
    
    setNewRelayUrl('');
  };

  const removeRelay = (url) => {
    setRelays(prev => prev.filter(r => r.url !== url));
    addLog(`🔌 Removed ${url}`);
  };

  const toggleRelayPerm = (url, perm) => {
    setRelays(prev => prev.map(r => 
      r.url === url ? { ...r, [perm]: !r[perm] } : r
    ));
  };

  // SIGNING
  const signEvent = async (event) => {
    if (currentUser.authMethod === 'nip07') {
      return await window.nostr.signEvent(event);
    } else if (currentUser.authMethod === 'bunker') {
      // Simulate bunker signing
      addLog('📡 Requesting signature from Bunker...', 'info');
      await new Promise(resolve => setTimeout(resolve, 500));
      event.sig = Array.from({length: 128}, () => Math.floor(Math.random() * 16).toString(16)).join('');
      return event;
    } else {
      event.sig = Array.from({length: 128}, () => Math.floor(Math.random() * 16).toString(16)).join('');
      return event;
    }
  };

  // DOCUMENT ACTIONS
  const submitProposal = async (content, reason) => {
    const event = createEvent(30078, JSON.stringify({
      type: 'edit_proposal',
      proposedContent: content,
      reason
    }), [
      ['d', `prop-${Date.now()}`],
      ['a', `30023:${document.ownerPubkey}:${document.id}`],
      ['status', 'pending'],
      ['p', document.ownerPubkey]
    ], currentUser.publicKey);

    const signed = await signEvent(event);
    setProposals(prev => [...prev, {
      id: signed.id,
      content,
      reason,
      status: 'pending',
      submittedBy: currentUser.publicKey,
      submittedAt: Date.now()
    }]);
    
    const writeRelays = relays.filter(r => r.write && r.status === 'connected');
    addLog(`📝 Proposal submitted to ${writeRelays.length} relay(s)`, 'success');
    writeRelays.forEach(r => addLog(`  → ${r.url}`, 'event'));
  };

  const approveProposal = async (proposalId) => {
    const proposal = proposals.find(p => p.id === proposalId);
    const approval = createEvent(30078, JSON.stringify({
      type: 'approval',
      decision: 'approved'
    }), [
      ['d', `appr-${Date.now()}`],
      ['e', proposalId],
      ['p', proposal.submittedBy],
      ['decision', 'approved']
    ], currentUser.publicKey);

    await signEvent(approval);
    
    const newDoc = createEvent(30023, proposal.content, [
      ['d', document.id],
      ['title', document.title],
      ['e', proposalId]
    ], currentUser.publicKey);
    
    await signEvent(newDoc);
    
    setDocument(prev => ({ ...prev, content: proposal.content }));
    setProposals(prev => prev.map(p => 
      p.id === proposalId ? { ...p, status: 'approved' } : p
    ));
    
    addLog(`✅ Proposal approved and published`, 'success');
  };

  // UI RENDERS
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-lg p-8 border border-white/20">
          <FileText className="w-16 h-16 text-purple-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white text-center mb-2">Nostr Docs</h1>
          <p className="text-purple-200 text-center mb-6">Sign in to collaborate</p>

          <div className="space-y-3">
            {hasNip07 && (
              <button onClick={signInNip07} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-4 rounded-lg font-semibold flex items-center justify-center gap-3">
                <Key className="w-5 h-5" />
                Sign in with NIP-07
              </button>
            )}
            
            <button onClick={() => setShowAuthModal('privkey')} className="w-full bg-white/20 hover:bg-white/30 text-white px-6 py-4 rounded-lg font-semibold flex items-center justify-center gap-3">
              <LogIn className="w-5 h-5" />
              Sign in with Private Key
            </button>
            
            <button onClick={() => setShowAuthModal('bunker')} className="w-full bg-white/20 hover:bg-white/30 text-white px-6 py-4 rounded-lg font-semibold flex items-center justify-center gap-3">
              <Wifi className="w-5 h-5" />
              Sign in with Bunker (NIP-46)
            </button>
          </div>

          {!hasNip07 && (
            <div className="mt-6 bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-yellow-200 text-sm">
                💡 Install <a href="https://getalby.com" target="_blank" className="underline">Alby</a> or <a href="https://github.com/fiatjaf/nos2x" target="_blank" className="underline">nos2x</a> for NIP-07
              </p>
            </div>
          )}
        </div>

        {/* Auth Modals */}
        {showAuthModal === 'privkey' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">Sign in with Private Key</h3>
              <input
                type="password"
                value={manualPrivKey}
                onChange={(e) => setManualPrivKey(e.target.value)}
                placeholder="64-char hex private key..."
                className="w-full bg-slate-900 text-white p-3 rounded-lg font-mono text-sm mb-3"
              />
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4">
                <p className="text-red-200 text-sm">⚠️ Never paste real keys on untrusted sites!</p>
              </div>
              <div className="flex gap-2">
                <button onClick={signInPrivateKey} className="flex-1 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold">
                  Sign In
                </button>
                <button onClick={() => setShowAuthModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showAuthModal === 'bunker' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">Connect to Nostr Bunker</h3>
              <p className="text-purple-200 text-sm mb-4">Enter your bunker:// connection string:</p>
              <input
                type="text"
                value={bunkerUri}
                onChange={(e) => setBunkerUri(e.target.value)}
                placeholder="bunker://..."
                className="w-full bg-slate-900 text-white p-3 rounded-lg font-mono text-sm mb-4"
              />
              <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 mb-4">
                <p className="text-blue-200 text-sm">
                  💡 Get your bunker URI from apps like <a href="https://nsec.app" target="_blank" className="underline">nsec.app</a>
                </p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={signInBunker} 
                  disabled={bunkerConnecting}
                  className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-500 text-white px-4 py-2 rounded-lg font-semibold"
                >
                  {bunkerConnecting ? 'Connecting...' : 'Connect'}
                </button>
                <button onClick={() => setShowAuthModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Nostr Collaborative Documents</h1>
              <p className="text-purple-200">Decentralized approval-based editing</p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setShowRelayModal(true)} className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                <Wifi className="w-4 h-4" />
                Relays ({relays.filter(r => r.status === 'connected').length})
              </button>
              <div className="text-right">
                <p className="text-sm text-purple-200">Signed in via {currentUser.authMethod.toUpperCase()}</p>
                <p className="text-white font-mono text-sm">{currentUser.publicKey.slice(0, 16)}...</p>
                <button onClick={() => setCurrentUser(null)} className="text-sm text-purple-300 hover:text-purple-100">
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Relay Modal */}
        {showRelayModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
            <div className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full border border-white/20 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Relay Configuration</h3>
                <button onClick={() => setShowRelayModal(false)} className="text-white hover:text-red-400">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-6">
                <label className="text-white block mb-2">Add Relay:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRelayUrl}
                    onChange={(e) => setNewRelayUrl(e.target.value)}
                    placeholder="wss://relay.example.com"
                    className="flex-1 bg-slate-900 text-white p-3 rounded-lg"
                  />
                  <button onClick={addRelay} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {POPULAR_RELAYS.filter(r => !relays.some(relay => relay.url === r)).map(relay => (
                    <button
                      key={relay}
                      onClick={() => setNewRelayUrl(relay)}
                      className="text-xs bg-slate-700 text-purple-300 px-2 py-1 rounded hover:bg-slate-600"
                    >
                      {relay.replace('wss://', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {relays.map(relay => (
                  <div key={relay.url} className="bg-slate-900 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {relay.status === 'connected' ? 
                          <Wifi className="w-4 h-4 text-green-400" /> : 
                          <WifiOff className="w-4 h-4 text-red-400" />
                        }
                        <span className="text-white font-mono text-sm">{relay.url}</span>
                      </div>
                      <button onClick={() => removeRelay(relay.url)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2 text-purple-200 cursor-pointer">
                        <input type="checkbox" checked={relay.read} onChange={() => toggleRelayPerm(relay.url, 'read')} />
                        Read
                      </label>
                      <label className="flex items-center gap-2 text-purple-200 cursor-pointer">
                        <input type="checkbox" checked={relay.write} onChange={() => toggleRelayPerm(relay.url, 'write')} />
                        Write
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <DocumentView 
              document={document}
              currentUser={currentUser}
              onSubmitProposal={submitProposal}
            />
            <ProposalsView 
              proposals={proposals}
              currentUser={currentUser}
              documentOwner={document.ownerPubkey}
              onApprove={approveProposal}
            />
          </div>
          <div>
            <LogsPanel logs={logs} />
          </div>
        </div>
      </div>
    </div>
  );
};

const DocumentView = ({ document, currentUser, onSubmitProposal }) => {
  const [editMode, setEditMode] = useState(false);
  const [content, setContent] = useState('');
  const [reason, setReason] = useState('');

  const startEdit = () => {
    setContent(document.content);
    setReason('');
    setEditMode(true);
  };

  const submit = () => {
    if (!reason || content === document.content) return;
    onSubmitProposal(content, reason);
    setEditMode(false);
  };

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white">{document.title}</h2>
        {!editMode && currentUser.publicKey !== document.ownerPubkey && (
          <button onClick={startEdit} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <Edit className="w-4 h-4" />
            Propose Edit
          </button>
        )}
      </div>

      {!editMode ? (
        <div className="bg-slate-800/50 rounded-lg p-6 text-white whitespace-pre-wrap font-mono">
          {document.content}
        </div>
      ) : (
        <div className="space-y-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-64 bg-slate-800 text-white p-4 rounded-lg font-mono"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for changes..."
            className="w-full bg-slate-800 text-white p-3 rounded-lg"
          />
          <div className="flex gap-2">
            <button onClick={submit} disabled={!reason || content === document.content} className="bg-green-500 hover:bg-green-600 disabled:bg-gray-500 text-white px-6 py-2 rounded-lg flex items-center gap-2">
              <Send className="w-4 h-4" />
              Submit Proposal
            </button>
            <button onClick={() => setEditMode(false)} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ProposalsView = ({ proposals, currentUser, documentOwner, onApprove }) => (
  <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
    <h3 className="text-xl font-bold text-white mb-4">Proposals</h3>
    {proposals.length === 0 ? (
      <p className="text-purple-200 text-center py-8">No proposals yet</p>
    ) : (
      <div className="space-y-4">
        {proposals.slice().reverse().map(p => (
          <div key={p.id} className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  p.status === 'pending' ? 'bg-yellow-500' : 'bg-green-500'
                } text-white`}>
                  {p.status}
                </span>
                <p className="text-white mt-2"><strong>Reason:</strong> {p.reason}</p>
              </div>
              {p.status === 'pending' && currentUser.publicKey === documentOwner && (
                <button onClick={() => onApprove(p.id)} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Approve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const LogsPanel = ({ logs }) => (
  <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
    <h3 className="text-xl font-bold text-white mb-4">Event Log</h3>
    <div className="space-y-2 max-h-[600px] overflow-y-auto">
      {logs.slice().reverse().map((log, i) => (
        <div key={i} className={`p-3 rounded-lg text-sm ${
          log.type === 'success' ? 'bg-green-900/30 text-green-300' :
          log.type === 'error' ? 'bg-red-900/30 text-red-300' :
          log.type === 'event' ? 'bg-blue-900/30 text-blue-300' :
          'bg-slate-800/50 text-purple-200'
        }`}>
          <div className="flex justify-between">
            <span className="font-mono">{log.msg}</span>
            <span className="text-xs opacity-70">{log.time}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default App;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
