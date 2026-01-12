import React, { useState, useEffect } from 'react';
import {
  Key, FileText, Check, Edit, Send, Plus, LogOut,
  ExternalLink, X, Wifi, Trash2, RefreshCw,
  Heart, Zap, Copy, MoreVertical, Loader, LayoutDashboard,
  Clock, Users, Bell, GitBranch
} from 'lucide-react';
import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKNip46Signer
} from '@nostr-dev-kit/ndk';
import DiffMatchPatch from 'diff-match-patch';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { v4 as uuidv4 } from 'uuid';
import MDEditor from '@uiw/react-md-editor';

const dmp = new DiffMatchPatch();
const defaultRelays = ['wss://relay.damus.io'];

const App = () => {
  const [ndk, setNdk] = useState(null);
  const [user, setUser] = useState(null);
  const [signerType, setSignerType] = useState(null);

  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');

  const [documents, setDocuments] = useState([]);
  const [globalDocs, setGlobalDocs] = useState([]);
  const [currentTab, setCurrentTab] = useState('my-docs');

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [docHistory, setDocHistory] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState(null);

  const [suggestions, setSuggestions] = useState([]);
  const [mySuggestions, setMySuggestions] = useState([]);
  const [pendingSuggestionsCount, setPendingSuggestionsCount] = useState({});

  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocPrivate, setNewDocPrivate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRelays, setShowRelays] = useState(false);
  const [nip05Cache, setNip05Cache] = useState({});

  const [relays, setRelays] = useState(defaultRelays);
  const [newRelay, setNewRelay] = useState('');

  const [creatingAccount, setCreatingAccount] = useState(false);
  const [loading, setLoading] = useState(false);

  /* =========================
     NDK INIT + SESSION RESTORE
     ========================= */
  useEffect(() => {
    const initNdk = new NDK({ explicitRelayUrls: relays });
    initNdk.connect();
    setNdk(initNdk);
    const savedUser = localStorage.getItem('nostr_user');
    const savedSignerType = localStorage.getItem('nostr_signer_type');
    const savedHexSk = localStorage.getItem('nostr_nsec_hex');
    if (savedUser && savedSignerType && savedHexSk) {
      const signer = new NDKPrivateKeySigner(savedHexSk);
      initNdk.signer = signer;
      signer.user().then(u => {
        setUser(u);
        setSignerType(savedSignerType);
      });
    }
  }, [relays]);

  /* =========================
     AUTH HANDLERS
     ========================= */
  const handleNip07Login = async () => {
    if (!window.nostr) return alert('No NIP-07 extension found.');
    const signer = new NDKNip07Signer();
    ndk.signer = signer;
    const u = await signer.user();
    setUser(u);
    setSignerType('nip07');
    localStorage.setItem('nostr_user', u.pubkey);
    localStorage.setItem('nostr_signer_type', 'nip07');
  };

  const handleCreateAccount = async () => {
    setCreatingAccount(true);
    const sk = generateSecretKey();
    const nsecEncoded = nip19.nsecEncode(sk);
    const npubEncoded = nip19.npubEncode(getPublicKey(sk));
    const confirmed = confirm(
      `Your New Nostr Account:\n\nnpub: ${npubEncoded}\n\nnsec: ${nsecEncoded}\n\nSAVE YOUR NSEC!\n\nClick OK to continue`
    );
    if (!confirmed) {
      setCreatingAccount(false);
      return;
    }
    const signer = new NDKPrivateKeySigner(sk);
    ndk.signer = signer;
    const u = await signer.user();
    setUser(u);
    setSignerType('nsec');
    localStorage.setItem('nostr_user', u.pubkey);
    localStorage.setItem('nostr_signer_type', 'nsec');
    const hex = Array.from(sk)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem('nostr_nsec_hex', hex);
    setCreatingAccount(false);
  };

  const handleNsecLogin = async () => {
    if (!nsec.startsWith('nsec')) return alert('Invalid nsec format.');
    try {
      const { type, data } = nip19.decode(nsec);
      if (type !== 'nsec') throw new Error('Not an nsec');
      const signer = new NDKPrivateKeySigner(data);
      ndk.signer = signer;
      const u = await signer.user();
      setUser(u);
      setSignerType('nsec');
      setNsec('');
      localStorage.setItem('nostr_user', u.pubkey);
      localStorage.setItem('nostr_signer_type', 'nsec');
      const hex = Array.from(data)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem('nostr_nsec_hex', hex);
    } catch (err) {
      alert('Failed to decode nsec: ' + err.message);
    }
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.startsWith('bunker://')) {
      return alert('Invalid bunker URI');
    }
    try {
      const signer = new NDKNip46Signer(ndk, bunkerUri);
      await signer.blockUntilReady();
      ndk.signer = signer;
      const u = await signer.user();
      setUser(u);
      setSignerType('bunker');
      localStorage.setItem('nostr_user', u.pubkey);
      localStorage.setItem('nostr_signer_type', 'bunker');
    } catch (err) {
      alert('Bunker connection failed: ' + err.message);
    }
  };

  const logout = () => {
    if (ndk) ndk.signer = null;
    setUser(null);
    setSignerType(null);
    setSelectedDoc(null);
    localStorage.clear();
    window.history.pushState({}, '', '/');
  };

  /* =========================
     DOCUMENT FETCHING
     ========================= */
  const fetchDocuments = async () => {
    if (!user || !ndk) return;
    setLoading(true);
    try {
      const filter = {
        kinds: [30023],
        authors: [user.pubkey]
      };
      const events = await ndk.fetchEvents(filter, {
        closeOnEose: true
      });
      const docs = Array.from(events).map(e => ({
        id: e.tagValue('d'),
        title: e.tagValue('title') || 'Untitled',
        event: e,
        isCollaborative: e.tags.some(t => t[0] === 't' && t[1] === 'collaborative')
      }));
      setDocuments(docs);
     
      // Fetch pending suggestions count for each doc
      await fetchPendingSuggestionsCount(docs);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingSuggestionsCount = async (docs) => {
    if (!user || !ndk || docs.length === 0) return;
   
    const myDocs = docs.map(d => `30023:${user.pubkey}:${d.id}`);
   
    const filter = {
      kinds: [30078],
      '#a': myDocs
    };
    const events = await ndk.fetchEvents(filter, { closeOnEose: true });
   
    // Get all status updates
    const statusUpdates = Array.from(events)
      .filter(e => {
        try {
          const data = JSON.parse(e.content || '{}');
          return data.type === 'status_update';
        } catch {
          return false;
        }
      });
   
    // Build a map of suggestion ID to latest status
    const statusMap = {};
    statusUpdates.forEach(e => {
      const refTag = e.tags.find(t => t[0] === 'e');
      if (refTag && refTag[1]) {
        const sugId = refTag[1];
        const status = e.tagValue('status');
        if (!statusMap[sugId] || e.created_at > statusMap[sugId].created_at) {
          statusMap[sugId] = { status, created_at: e.created_at };
        }
      }
    });
   
    // Count pending suggestions per document
    const counts = {};
    Array.from(events)
      .filter(e => {
        try {
          const data = JSON.parse(e.content || '{}');
          return data.type === 'edit_proposal' && e.pubkey !== user.pubkey;
        } catch {
          return false;
        }
      })
      .forEach(e => {
        const statusInfo = statusMap[e.id];
        const status = statusInfo ? statusInfo.status : 'pending';
       
        if (status === 'pending') {
          const aTag = e.tags.find(t => t[0] === 'a');
          if (aTag && aTag[1]) {
            const docRef = aTag[1];
            counts[docRef] = (counts[docRef] || 0) + 1;
          }
        }
      });
   
    setPendingSuggestionsCount(counts);
  };

  const fetchGlobalDocs = async () => {
    if (!ndk) return;
    setLoading(true);
    try {
      const filter = {
        kinds: [30023],
        limit: 50
      };
      const events = await ndk.fetchEvents(filter, {
        closeOnEose: true
      });
      const publicDocs = Array.from(events)
        .filter(e => !e.tags.some(t => t[0] === '-'))
        .map(e => ({
          id: e.tagValue('d'),
          title: e.tagValue('title') || 'Untitled',
          author: e.pubkey,
          event: e,
          isCollaborative: e.tags.some(t => t[0] === 't' && t[1] === 'collaborative')
        }));
      setGlobalDocs(publicDocs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && ndk) fetchDocuments();
  }, [user, ndk]);

  useEffect(() => {
    if (currentTab === 'global' && ndk) {
      fetchGlobalDocs();
    }
  }, [currentTab, ndk]);

  /* =========================
     DEEP LINK DOC LOADING
     ========================= */
  useEffect(() => {
    if (!ndk) return;
    const path = window.location.pathname;
    const match = path.match(/^\/doc\/([a-f0-9-]{36})$/);
    if (!match) return;
    const targetId = match[1];
    const fetchAndLoadDoc = async () => {
      if (selectedDoc && selectedDoc.id === targetId) return;
      const myDoc = documents.find(d => d.id === targetId);
      if (myDoc) {
        loadDoc(myDoc);
        return;
      }
      const filter = {
        kinds: [30023],
        '#d': [targetId]
      };
      const events = await ndk.fetchEvents(filter, {
        closeOnEose: false
      });
      const history = Array.from(events).sort(
        (a, b) => b.created_at - a.created_at
      );
      if (history.length > 0) {
        const latest = history[0];
        loadDoc({
          id: targetId,
          title: latest.tagValue('title') || 'Untitled',
          event: latest,
          isCollaborative: latest.tags.some(t => t[0] === 't' && t[1] === 'collaborative')
        });
      } else {
        alert('Document not found or is private.');
        window.history.pushState({}, '', '/');
      }
    };
    fetchAndLoadDoc();
  }, [ndk, selectedDoc, documents]);

  /* =========================
     DOCUMENT CRUD
     ========================= */
  const createDocument = async () => {
    if (!user || !ndk || !newDocTitle.trim()) return;
    setLoading(true);
    try {
      const docId = uuidv4();
      const event = new NDKEvent(ndk);
      event.kind = 30023;
      event.tags = [
        ['d', docId],
        ['title', newDocTitle],
        ['t', 'collaborative']
      ];
      if (newDocPrivate) {
        event.tags.push(['-']);
      }
      event.content = `# ${newDocTitle}\n\nStart writing here...`;
      await event.sign();
      await event.publish();
      fetchDocuments();
      setNewDocTitle('');
      setNewDocPrivate(false);
    } finally {
      setLoading(false);
    }
  };

  const deleteDocument = async (doc) => {
    if (!user || user.pubkey !== doc.event.pubkey) {
      return alert('Only owner can delete');
    }
    if (!confirm(`Delete "${doc.title}" permanently?`)) return;
    setLoading(true);
    try {
      const delEvent = new NDKEvent(ndk);
      delEvent.kind = 5;
      delEvent.tags = [
        ['e', doc.event.id],
        ['a', `30023:${user.pubkey}:${doc.id}`]
      ];
      await delEvent.sign();
      await delEvent.publish();
      await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for propagation
      setDocuments(documents.filter(d => d.id !== doc.id));
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc(null);
        window.history.pushState({}, '', '/');
      }
      alert('Document deleted');
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDoc = async (doc) => {
    window.history.pushState({}, '', `/doc/${doc.id}`);
    setIsEditing(false);
    setSelectedRevision(null);
    // Load full NIP-33 revision history
    const historyFilter = {
      kinds: [30023],
      '#d': [doc.id]
    };
    const historyEvents = await ndk.fetchEvents(historyFilter, {
      closeOnEose: false,
      limit: 100
    });
    const history = Array.from(historyEvents).sort(
      (a, b) => b.created_at - a.created_at
    );
    setDocHistory(history);
    // Set canonical latest version
    if (history.length > 0) {
      const latest = history[0];
      setSelectedDoc({ ...doc, event: latest });
      setDocContent(latest.content || '');
    } else {
      setSelectedDoc(doc);
      setDocContent(doc.event.content || '');
    }
    // Fetch suggestions if owner
    if (user && user.pubkey === doc.event.pubkey) {
      const sugFilter = {
        kinds: [30078],
        '#a': [`30023:${doc.event.pubkey}:${doc.id}`]
      };
      const sugs = await ndk.fetchEvents(sugFilter, {
        closeOnEose: false
      });
      // Get status updates
      const allEvents = Array.from(sugs);
      const statusUpdates = allEvents.filter(e => {
        try {
          const data = JSON.parse(e.content || '{}');
          return data.type === 'status_update';
        } catch {
          return false;
        }
      });
     
      const statusMap = {};
      statusUpdates.forEach(e => {
        const refTag = e.tags.find(t => t[0] === 'e');
        if (refTag && refTag[1]) {
          const sugId = refTag[1];
          const status = e.tagValue('status');
          if (!statusMap[sugId] || e.created_at > statusMap[sugId].created_at) {
            statusMap[sugId] = { status, created_at: e.created_at };
          }
        }
      });
      const proposals = allEvents
        .filter(e => {
          try {
            const data = JSON.parse(e.content || '{}');
            return data.type === 'edit_proposal';
          } catch {
            return false;
          }
        })
        .map(s => {
          let data = {};
          try {
            data = JSON.parse(s.content || '{}');
          } catch {
            data = {};
          }
         
          const statusInfo = statusMap[s.id];
          const status = statusInfo ? statusInfo.status : 'pending';
         
          return { event: s, data, status };
        })
        .filter(s => s.status === 'pending');
      setSuggestions(proposals);
    }
  };

  const saveDoc = async (closeAfterSave = true) => {
    if (
      !selectedDoc ||
      !ndk ||
      !user ||
      user.pubkey !== selectedDoc.event.pubkey
    ) {
      return alert('Only owner can save');
    }
    setLoading(true);
    try {
      const event = new NDKEvent(ndk);
      event.kind = 30023;
     
      event.tags = selectedDoc.event.tags.filter(t => t[0] !== 'e');
     
      event.content = docContent;
      await event.sign();
      await event.publish();
      alert('Document saved!');
      fetchDocuments();
      if (currentTab === 'global') fetchGlobalDocs();
      if (closeAfterSave) {
        setSelectedDoc(null);
        window.history.pushState({}, '', '/');
      } else {
        // Reload the doc to get updated history
        const filter = {
          kinds: [30023],
          '#d': [selectedDoc.id]
        };
        const events = await ndk.fetchEvents(filter, { closeOnEose: false });
        const updatedEvent = Array.from(events)[0];
        if (updatedEvent) {
          await loadDoc({
            ...selectedDoc,
            event: updatedEvent
          });
        }
      }
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const suggestEdit = async () => {
    if (!selectedDoc || !user) return;
    if (user.pubkey === selectedDoc.event.pubkey) {
      return alert('Document owners save changes directly.');
    }
    const reason = prompt(
      'Reason for your suggestion (optional):'
    );
    if (reason === null) return;
    setLoading(true);
    try {
      const event = new NDKEvent(ndk);
      event.kind = 30078;
      event.tags = [
        [
          'a',
          `30023:${selectedDoc.event.pubkey}:${selectedDoc.id}`
        ],
        ['status', 'pending']
      ];
      event.content = JSON.stringify({
        type: 'edit_proposal',
        originalContent: selectedDoc.event.content,
        proposedContent: docContent,
        reason: reason || 'No reason provided'
      });
      await event.sign();
      await event.publish();
      alert('Edit suggestion submitted!');
     
      setSelectedDoc(null);
      window.history.pushState({}, '', '/');
    } finally {
      setLoading(false);
    }
  };

  const approveSuggestion = async (sug) => {
    if (!user || !ndk) return;
    setLoading(true);
    try {
      // Publish updated document with proposed content
      const docEvent = new NDKEvent(ndk);
      docEvent.kind = 30023;
      docEvent.tags = selectedDoc.event.tags; // Preserve tags
      docEvent.content = sug.data.proposedContent;
      await docEvent.sign();
      await docEvent.publish();

      // Publish approval signal (kind 1111)
      const approvalEvent = new NDKEvent(ndk);
      approvalEvent.kind = 1111;
      approvalEvent.content = 'approved'; // Or JSON with reason
      approvalEvent.tags = [
        ['e', sug.event.id], // Reference suggestion
        ['p', sug.event.pubkey], // Suggester
        ['a', `30023:${user.pubkey}:${selectedDoc.id}`] // Doc reference
      ];
      await approvalEvent.sign();
      await approvalEvent.publish();

      alert('Suggestion approved and document updated!');
      // Reload
      loadDoc(selectedDoc);
    } catch (err) {
      alert('Approval failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const rejectSuggestion = async (sug) => {
    if (!user || !ndk) return;
    setLoading(true);
    try {
      // Publish rejection signal (kind 1111)
      const rejectionEvent = new NDKEvent(ndk);
      rejectionEvent.kind = 1111;
      rejectionEvent.content = 'rejected'; // Or JSON with reason
      rejectionEvent.tags = [
        ['e', sug.event.id],
        ['p', sug.event.pubkey],
        ['a', `30023:${user.pubkey}:${selectedDoc.id}`]
      ];
      await rejectionEvent.sign();
      await rejectionEvent.publish();

      alert('Suggestion rejected!');
      // Reload suggestions
      loadDoc(selectedDoc);
    } catch (err) {
      alert('Rejection failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     NIP-05 VERIFICATION
     ========================= */
  const fetchNip05 = async (pubkey) => {
    if (nip05Cache[pubkey]) return nip05Cache[pubkey];
   
    try {
      const filter = {
        kinds: [0],
        authors: [pubkey]
      };
     
      const events = await ndk.fetchEvents(filter, { closeOnEose: true });
      const event = Array.from(events)[0];
     
      if (event) {
        const profile = JSON.parse(event.content || '{}');
        const nip05 = profile.nip05 || null;
        setNip05Cache(prev => ({ ...prev, [pubkey]: nip05 }));
        return nip05;
      }
    } catch {
      return null;
    }
   
    return null;
  };

  const DisplayName = ({ pubkey }) => {
    const [nip05, setNip05] = useState(nip05Cache[pubkey] || null);
   
    useEffect(() => {
      if (!nip05Cache[pubkey]) {
        fetchNip05(pubkey).then(setNip05);
      }
    }, [pubkey]);
   
    if (nip05) {
      return (
        <span className="text-purple-300 text-sm">
          {nip05} <span className="text-purple-500">({pubkey.slice(0, 8)}...)</span>
        </span>
      );
    }
   
    return (
      <span className="text-purple-300 text-sm font-mono">
        {pubkey.slice(0, 12)}...
      </span>
    );
  };

  /* =========================
     AUTH GUARD
     ========================= */
  if (!user || !ndk) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 border border-white/20 max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-4">
            Nostr Collaborative Docs
          </h1>
          <div className="space-y-4">
            <button
              onClick={handleNip07Login}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 rounded-lg flex items-center gap-2 justify-center"
            >
              <Key className="w-4 h-4" /> Login with Extension
            </button>
            <input
              value={nsec}
              onChange={e => setNsec(e.target.value)}
              placeholder="nsec..."
              className="w-full bg-slate-800 text-white p-3 rounded-lg"
            />
            <button
              onClick={handleNsecLogin}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-lg"
            >
              Login with nsec
            </button>
            <input
              value={bunkerUri}
              onChange={e => setBunkerUri(e.target.value)}
              placeholder="bunker://..."
              className="w-full bg-slate-800 text-white p-3 rounded-lg"
            />
            <button
              onClick={handleBunkerLogin}
              className="w-full bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-3 rounded-lg"
            >
              Login with Bunker
            </button>
            <button
              onClick={handleCreateAccount}
              disabled={creatingAccount}
              className="w-full bg-green-600 hover:bg-green-500 text-white px-4 py-3 rounded-lg"
            >
              {creatingAccount ? 'Creating…' : 'Create New Account'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const userNpub = nip19.npubEncode(user.pubkey);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-2">
                Nostr Collaborative Documents
              </h1>
              <p className="text-purple-200 mb-4">
                Decentralized approval-based editing
              </p>
             
              {/* Feed toggle in header */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCurrentTab('my-docs');
                    setSelectedDoc(null);
                    window.history.pushState({}, '', '/');
                  }}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                    currentTab === 'my-docs'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-purple-200 hover:bg-white/20'
                  }`}
                >
                  My Documents
                </button>
                <button
                  onClick={() => {
                    setCurrentTab('global');
                    setSelectedDoc(null);
                    window.history.pushState({}, '', '/');
                    fetchGlobalDocs();
                  }}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                    currentTab === 'global'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-purple-200 hover:bg-white/20'
                  }`}
                >
                  Global Feed
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowRelays(true)}
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Wifi className="w-4 h-4" />
                Relays ({relays.length})
              </button>
              <div className="text-right">
                <p className="text-sm text-purple-200">Signed in as</p>
                <a
                  href={`https://primal.net/p/${userNpub}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white font-mono text-sm hover:underline flex items-center gap-1"
                >
                  {user.pubkey.slice(0, 12)}...
                  {user.pubkey.slice(-6)}
                  <ExternalLink className="w-3 h-3" />
                </a>
                <p className="text-purple-300 text-xs">
                  ({signerType})
                </p>
                <button
                  onClick={logout}
                  className="mt-2 text-sm text-red-300 hover:text-red-100 underline flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* RELAY MODAL */}
        {showRelays && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50"
            onClick={() => setShowRelays(false)}
          >
            <div
              className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full border border-white/20"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">
                  Relay Configuration
                </h3>
                <button onClick={() => setShowRelays(false)}>
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
              <div className="flex gap-2 mb-4">
                <input
                  value={newRelay}
                  onChange={e => setNewRelay(e.target.value)}
                  placeholder="wss://relay.example.com"
                  className="flex-1 bg-slate-900 text-white p-3 rounded-lg"
                />
                <button
                  onClick={() => {
                    if (
                      newRelay.startsWith('wss://') &&
                      !relays.includes(newRelay)
                    ) {
                      setRelays([...relays, newRelay]);
                      setNewRelay('');
                    }
                  }}
                  className="bg-purple-500 px-4 py-2 rounded-lg text-white"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {relays.map(r => (
                  <div
                    key={r}
                    className="bg-slate-900 p-4 rounded-lg flex justify-between items-center"
                  >
                    <span className="text-white font-mono text-sm">
                      {r}
                    </span>
                    <button
                      onClick={() =>
                        relays.length > 1 &&
                        setRelays(relays.filter(x => x !== r))
                      }
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* MAIN CONTENT */}
        <div className="flex-1">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          )}
          {/* DOCUMENT LIST */}
          {!selectedDoc && !loading && (
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">
                  {currentTab === 'global'
                    ? 'Global Public Documents'
                    : 'Your Documents'}
                </h2>
                <button
                  onClick={
                    currentTab === 'global' ? fetchGlobalDocs : fetchDocuments
                  }
                  className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
              <div className="space-y-3 mb-6">
                {(currentTab === 'global' ? globalDocs : documents).map(doc => {
                  const docRef = `30023:${doc.event.pubkey}:${doc.id}`;
                  const pendingCount = pendingSuggestionsCount[docRef] || 0;
                 
                  return (
                    <div
                      key={doc.id}
                      onClick={() => loadDoc(doc)}
                      className="bg-slate-800/50 rounded-lg p-4 flex justify-between items-center hover:bg-slate-800/70 cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-semibold">
                            {doc.title}
                          </h3>
                          {doc.isCollaborative && (
                            <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded">
                              Collaborative
                            </span>
                          )}
                          {pendingCount > 0 && user.pubkey === doc.event.pubkey && (
                            <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded">
                              {pendingCount} pending
                            </span>
                          )}
                        </div>
                        <p className="text-purple-300 text-sm font-mono">
                          doc/{doc.id.slice(0, 12)}...
                        </p>
                        <div className="text-purple-400 text-xs">
                          Author: <DisplayName pubkey={doc.event.pubkey} />
                          {user.pubkey === doc.event.pubkey && ' (you)'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <ExternalLink className="w-5 h-5 text-purple-400" />
                        {user.pubkey === doc.event.pubkey && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              deleteDocument(doc);
                            }}
                            className="text-red-400 hover:text-red-200"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {currentTab !== 'global' && (
                <div className="flex gap-4">
                  <input
                    value={newDocTitle}
                    onChange={e => setNewDocTitle(e.target.value)}
                    placeholder="New document title"
                    className="flex-1 p-3 rounded-lg bg-white/10 text-white"
                  />
                  <label className="flex items-center gap-2 text-purple-200">
                    <input
                      type="checkbox"
                      checked={newDocPrivate}
                      onChange={e =>
                        setNewDocPrivate(e.target.checked)
                      }
                    />
                    Private
                  </label>
                  <button
                    onClick={createDocument}
                    className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg"
                  >
                    Create
                  </button>
                </div>
              )}
            </div>
          )}
          {/* DOCUMENT VIEW */}
          {selectedDoc && (
            <div className="space-y-6">
              <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-3xl font-bold text-white">
                        {selectedDoc.title}
                      </h2>
                      {selectedDoc.isCollaborative && (
                        <span className="bg-purple-600 text-white text-sm px-3 py-1 rounded">
                          Collaborative
                        </span>
                      )}
                    </div>
                    <input
                      value={`${window.location.origin}/doc/${selectedDoc.id}`}
                      readOnly
                      className="mt-3 w-full p-3 bg-slate-800/50 text-purple-300 rounded font-mono text-sm"
                    />
                  </div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="ml-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    History
                  </button>
                </div>
                {/* Edit History */}
                {showHistory && (
                  <div className="mt-6 bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
                    <h3 className="text-xl font-bold text-white mb-4">
                      Edit History
                    </h3>
                    <div className="space-y-3">
                      {docHistory.map((revision, idx) => (
                        <div
                          key={revision.id}
                          className={`bg-slate-800/50 rounded-lg p-4 cursor-pointer hover:bg-slate-800/70 ${
                            selectedRevision?.id === revision.id ? 'border-2 border-purple-500' : ''
                          }`}
                          onClick={() => {
                            if (selectedRevision?.id === revision.id) {
                              setSelectedRevision(null);
                            } else {
                              setSelectedRevision(revision);
                            }
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-purple-300 font-semibold">
                                Version {docHistory.length - idx}
                              </span>
                              <p className="text-white text-sm mt-1">
                                {revision.content.slice(0, 100)}...
                              </p>
                            </div>
                            <span className="text-purple-200 text-xs">
                              {new Date(revision.created_at * 1000).toLocaleString()}
                            </span>
                          </div>
                          
                          {selectedRevision?.id === revision.id && (
                            <div className="mt-4 bg-slate-900 rounded-lg p-4 border border-purple-500/30">
                              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                                <Zap className="w-4 h-4" />
                                Changes vs latest
                              </h4>

                              <div
                                className="bg-black p-3 rounded text-sm overflow-auto max-h-[400px]"
                                dangerouslySetInnerHTML={{
                                  __html: dmp.diff_prettyHtml(
                                    dmp.diff_main(
                                      revision.content || '',
                                      docHistory[0]?.content || ''
                                    )
                                  )
                                }}
                              />

                              <div className="flex gap-3 mt-4">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDocContent(revision.content);
                                    setIsEditing(true);
                                    setSelectedRevision(null);
                                  }}
                                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg"
                                >
                                  Load this version
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Pending Suggestions */}
              {suggestions.length > 0 && user.pubkey === selectedDoc.event.pubkey && (
                <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
                  <h3 className="text-xl font-bold text-white mb-4">
                    Pending Suggestions ({suggestions.length})
                  </h3>
                  <div className="space-y-4">
                    {suggestions.map(sug => (
                      <div key={sug.event.id} className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-purple-300 text-sm">
                              From: {sug.event.pubkey.slice(0, 16)}...
                            </p>
                            <p className="text-white font-semibold mt-1">
                              {sug.data.reason}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => approveSuggestion(sug)}
                              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                            >
                              <Check className="w-4 h-4" />
                              Approve
                            </button>
                            <button
                              onClick={() => rejectSuggestion(sug)}
                              className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                            >
                              <X className="w-4 h-4" />
                              Reject
                            </button>
                          </div>
                        </div>
                       
                        <details className="mt-3">
                          <summary className="text-purple-300 cursor-pointer hover:text-purple-200">
                            View Changes
                          </summary>
                          <div className="mt-2 bg-slate-900 p-3 rounded text-sm">
                            <div className="mb-2">
                              <strong className="text-red-400">Original:</strong>
                              <pre className="text-gray-300 whitespace-pre-wrap mt-1">
                                {sug.data.originalContent?.substring(0, 200)}...
                              </pre>
                            </div>
                            <div>
                              <strong className="text-green-400">Proposed:</strong>
                              <pre className="text-gray-300 whitespace-pre-wrap mt-1">
                                {sug.data.proposedContent?.substring(0, 200)}...
                              </pre>
                            </div>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
                <MDEditor
                  value={docContent}
                  onChange={setDocContent}
                  height={600}
                  preview="live"
                  data-color-mode="dark"
                />
                {selectedRevision && (
  <div className="mt-6 bg-slate-900 rounded-lg p-4 border border-purple-500/30">
    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
      <Zap className="w-4 h-4" />
      Changes vs latest
    </h3>
    <div
      className="bg-black p-3 rounded text-sm overflow-auto max-h-[400px]"
      dangerouslySetInnerHTML={{
        __html: dmp.diff_prettyHtml(
          dmp.diff_main(
            selectedRevision.content || '',
            docHistory[0]?.content || ''
          )
        )
      }}
    />
    <div className="flex gap-3 mt-4">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setDocContent(selectedRevision.content);
          setIsEditing(true);
          setSelectedRevision(null);
        }}
        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg"
      >
        Load this version
      </button>
    </div>
  </div>
)}
                <div className="flex gap-4 mt-6">
                  {user.pubkey === selectedDoc.event.pubkey ? (
                    <button
                      onClick={() => saveDoc(true)}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg"
                    >
                      Save Changes
                    </button>
                  ) : (
                    <button
                      onClick={suggestEdit}
                      className="bg-yellow-600 hover:bg-yellow-500 text-white px-6 py-3 rounded-lg"
                    >
                      Suggest Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
