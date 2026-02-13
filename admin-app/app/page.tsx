'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface Document {
  id: string;
  title: string;
  created_at: string;
  deleted_at: string | null;
  metadata?: any;
}

interface Stats {
  supabase: {
    active_documents: number;
    deleted_documents: number;
    total: number;
  };
  pinecone: {
    total_vectors: number;
    dimension: number;
  };
}

export default function Home() {
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    // Load from localStorage
    const savedApiUrl = localStorage.getItem('apiUrl');
    const savedApiKey = localStorage.getItem('apiKey');
    if (savedApiUrl) setApiUrl(savedApiUrl);
    if (savedApiKey) setApiKey(savedApiKey);
  }, []);

  const saveConfig = () => {
    localStorage.setItem('apiUrl', apiUrl);
    localStorage.setItem('apiKey', apiKey);
  };

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadData = async () => {
    if (!apiUrl || !apiKey) {
      showMessage('Please enter API URL and API Key', 'error');
      return;
    }

    saveConfig();
    setLoading(true);

    try {
      // Load stats
      const statsRes = await axios.get(`${apiUrl}/api/internal/documents/stats`, {
        headers: { 'X-Internal-API-Key': apiKey }
      });
      setStats(statsRes.data.stats);

      // Load documents
      const docsRes = await axios.get(`${apiUrl}/api/internal/documents`, {
        headers: { 'X-Internal-API-Key': apiKey }
      });
      setDocuments(docsRes.data.documents);

      showMessage(`✅ Loaded ${docsRes.data.count} documents`, 'success');
    } catch (error: any) {
      showMessage(`❌ Error: ${error.response?.data?.message || error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!apiUrl || !apiKey) {
      showMessage('Please configure API settings first', 'error');
      return;
    }

    if (!uploadTitle || !uploadContent) {
      showMessage('Please enter title and content', 'error');
      return;
    }

    setUploading(true);

    try {
      await axios.post(
        `${apiUrl}/api/internal/documents/ingest`,
        {
          title: uploadTitle,
          content: uploadContent,
          program: 'general',
          category: 'kb_article'
        },
        {
          headers: { 'X-Internal-API-Key': apiKey }
        }
      );

      showMessage('✅ Document uploaded and processed!', 'success');
      setUploadTitle('');
      setUploadContent('');
      setUploadFile(null);
      
      // Reload data
      await loadData();
    } catch (error: any) {
      showMessage(`❌ Upload failed: ${error.response?.data?.message || error.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      
      // Read file content
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadContent(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?\n\nThis will remove:\n• Supabase record (soft delete)\n• All Pinecone vectors\n• S3 file`)) {
      return;
    }

    try {
      const res = await axios.delete(`${apiUrl}/api/internal/documents/${id}`, {
        headers: { 'X-Internal-API-Key': apiKey }
      });

      showMessage(`✅ Deleted "${title}" - Removed ${res.data.deletion_summary.vectors_deleted} vectors`, 'success');
      await loadData();
    } catch (error: any) {
      showMessage(`❌ Delete failed: ${error.response?.data?.message || error.message}`, 'error');
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">📚 Stevie Awards - Document Manager</h1>
          <p className="text-gray-600">Manage KB documents across Supabase, Pinecone, and S3</p>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">⚙️ Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://your-api.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Internal API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="stevie-internal-key-2024-secure"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition"
          >
            {loading ? '🔄 Loading...' : '🔄 Load Documents'}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`rounded-xl p-4 mb-6 ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="text-sm text-gray-600 mb-2">ACTIVE DOCUMENTS</div>
              <div className="text-4xl font-bold text-gray-800">{stats.supabase.active_documents}</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="text-sm text-gray-600 mb-2">DELETED DOCUMENTS</div>
              <div className="text-4xl font-bold text-gray-800">{stats.supabase.deleted_documents}</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="text-sm text-gray-600 mb-2">PINECONE VECTORS</div>
              <div className="text-4xl font-bold text-gray-800">{stats.pinecone.total_vectors}</div>
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📤 Upload Document</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Upload File (Optional)</label>
            <input
              type="file"
              accept=".txt,.md"
              onChange={handleFileChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Supports .txt and .md files</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Document title"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
            <textarea
              value={uploadContent}
              onChange={(e) => setUploadContent(e.target.value)}
              placeholder="Document content..."
              rows={8}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading || !uploadTitle || !uploadContent}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
          >
            {uploading ? '⏳ Uploading...' : '📤 Upload & Process'}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Will automatically: chunk content → generate embeddings → store in Pinecone + S3
          </p>
        </div>

        {/* Documents List */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">📄 Documents</h2>
          
          {documents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No documents found. Click "Load Documents" to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="border-2 border-gray-200 rounded-lg p-4 hover:border-purple-500 transition flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-gray-800">{doc.title}</div>
                    <div className="text-sm text-gray-600">
                      ID: {doc.id} • Created: {new Date(doc.created_at).toLocaleDateString()} •
                      {doc.deleted_at ? ' 🗑️ Deleted' : ' ✅ Active'}
                    </div>
                  </div>
                  {!doc.deleted_at && (
                    <button
                      onClick={() => handleDelete(doc.id, doc.title)}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
                    >
                      🗑️ Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
