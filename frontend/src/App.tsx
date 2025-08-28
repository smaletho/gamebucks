import { useState, useEffect } from 'react';
import './App.css';

interface AppResult {
  trackId: number;
  name: string;
  title: string;
  description: string;
  images: string[];
  rating: number;
}

function StarRating({ rating }: { rating: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars.push(<span key={i} className="star">&#9733;</span>);
    } else if (rating > i - 1) {
      const percent = Math.round((rating - (i - 1)) * 100);
      stars.push(
        <span key={i} className="star" style={{ position: 'relative', display: 'inline-block' }}>
          <span
            style={{
              position: 'absolute',
              width: `${percent}%`,
              height: '100%',
              overflow: 'hidden',
              color: '#FFD700',
              top: 0,
              left: 0,
              zIndex: 2,
            }}
          >&#9733;</span>
          <span style={{ color: '#e0e0e0', zIndex: 1 }}>&#9733;</span>
        </span>
      );
    } else {
      stars.push(<span key={i} className="star empty">&#9733;</span>);
    }
  }
  return <div className="rating-stars">{stars}</div>;
}

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AppResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppResult | null>(null);
  const [reviewForm, setReviewForm] = useState({
    overall_rating: 0,
    value_rating: 0,
    ad_rating: 0,
    effort_rating: 0,
    enjoyment_rating: 0,
    offer_amount: 0,
    comment: '',
  });
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const fetchReviews = async () => {
      if (selectedApp && (selectedApp as any).trackId) {
        const res = await fetch(`http://localhost:8000/reviews/${(selectedApp as any).trackId}`);
        if (res.ok) {
          const data = await res.json();
          setReviews(data);
        } else {
          setReviews([]);
        }
      } else {
        setReviews([]);
      }
    };
    fetchReviews();
  }, [selectedApp, reviewSuccess]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`http://localhost:8000/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data || []);
    } catch (err) {
      setResults([]);
    }
    setLoading(false);
  };

  const handleReviewChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setReviewForm(prev => ({ ...prev, [name]: name === 'comment' ? value : parseFloat(value) }));
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewLoading(true);
    setReviewSuccess(false);
    if (!selectedApp) return;
    const reviewPayload = {
      game_trackId: selectedApp.trackId,
      name: selectedApp.name,
      title: selectedApp.title,
      description: selectedApp.description,
      images: selectedApp.images,
      rating: selectedApp.rating ?? null,
      ...reviewForm,
    };
    try {
      const res = await fetch('http://localhost:8000/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(reviewPayload),
      });
      if (res.ok) setReviewSuccess(true);
    } catch {}
    setReviewLoading(false);
  };

  const handleAuthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const url = authMode === 'register' ? 'http://localhost:8000/register' : 'http://localhost:8000/login';
      const body = authMode === 'register'
        ? JSON.stringify(authForm)
        : new URLSearchParams(authForm as any).toString();
      const headers = authMode === 'register'
        ? { 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/x-www-form-urlencoded' };
      const res = await fetch(url, { method: 'POST', headers, body });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setAuthToken(data.access_token);
        localStorage.setItem('token', data.access_token);
        setAuthMode(null);
      } else {
        setAuthError(data.detail || 'Authentication failed');
      }
    } catch {
      setAuthError('Network error');
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    localStorage.removeItem('token');
  };

  return (
    <div className="container">
      <h1>App Search</h1>
      <form onSubmit={handleSearch} className="search-bar">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search for an app..."
        />
        <button type="submit" disabled={loading}>Search</button>
      </form>
      <div className="results">
        {loading && <p>Loading...</p>}
        {results.map(app => (
          <div key={app.name} className="app-card" onClick={() => setSelectedApp({
            ...app,
            trackId: app.trackId ?? (app as any).trackId ?? app.id // fallback for missing trackId
          })}>
            <img src={app.images && app.images[0]} alt={app.title} className="app-image" />
            <div className="app-info">
              <div className="app-title">{app.title}</div>
              <div className="app-description">{app.description}</div>
              <StarRating rating={app.rating ?? 0} />
            </div>
          </div>
        ))}
      </div>
      {selectedApp && (
        <div className="modal" onClick={() => setSelectedApp(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <img src={selectedApp.images && selectedApp.images[0]} alt={selectedApp.title} className="modal-image" />
              <div className="modal-title-rating">
                <div className="modal-title">{selectedApp.title}</div>
                <StarRating rating={selectedApp.rating ?? 0} />
              </div>
            </div>
            <div className="modal-description">{selectedApp.description}</div>
            <hr style={{margin: '1rem 0'}} />
            <div style={{marginBottom: '1rem'}}>
              {authToken ? (
                <>
                  <span>Logged in</span>
                  <button style={{marginLeft: '1rem'}} onClick={handleLogout}>Logout</button>
                </>
              ) : (
                <>
                  <button onClick={() => setAuthMode('login')}>Login</button>
                  <button onClick={() => setAuthMode('register')} style={{marginLeft: '0.5rem'}}>Register</button>
                </>
              )}
            </div>
            {authMode && (
              <form onSubmit={handleAuthSubmit} style={{marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                <h3>{authMode === 'login' ? 'Login' : 'Register'}</h3>
                <input name="username" placeholder="Username" value={authForm.username} onChange={handleAuthChange} required />
                <input name="password" type="password" placeholder="Password" value={authForm.password} onChange={handleAuthChange} required />
                <button type="submit">Submit</button>
                {authError && <span style={{color: 'red'}}>{authError}</span>}
              </form>
            )}
            <h3>Add a Review</h3>
            {!authToken ? (
              <div style={{color: 'red', marginBottom: '1rem'}}>You must be logged in to submit a review.</div>
            ) : (
              <form onSubmit={handleReviewSubmit} style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                <label>Overall Rating: <input type="number" name="overall_rating" min="0" max="5" step="0.1" value={reviewForm.overall_rating} onChange={handleReviewChange} required /></label>
                <label>Value Rating: <input type="number" name="value_rating" min="0" max="5" step="0.1" value={reviewForm.value_rating} onChange={handleReviewChange} required /></label>
                <label>Ad Rating: <input type="number" name="ad_rating" min="0" max="5" step="0.1" value={reviewForm.ad_rating} onChange={handleReviewChange} required /></label>
                <label>Effort Rating: <input type="number" name="effort_rating" min="0" max="5" step="0.1" value={reviewForm.effort_rating} onChange={handleReviewChange} required /></label>
                <label>Enjoyment Rating: <input type="number" name="enjoyment_rating" min="0" max="5" step="0.1" value={reviewForm.enjoyment_rating} onChange={handleReviewChange} required /></label>
                <label>Offer Amount: <input type="number" name="offer_amount" min="0" step="0.01" value={reviewForm.offer_amount} onChange={handleReviewChange} required /></label>
                <label>Comment:<br /><textarea name="comment" value={reviewForm.comment} onChange={handleReviewChange} rows={3} /></label>
                <button type="submit" disabled={reviewLoading}>Save</button>
                {reviewSuccess && <span style={{color: 'green'}}>Review saved!</span>}
              </form>
            )}
            <button onClick={() => setSelectedApp(null)}>Close</button>
            <hr style={{margin: '1rem 0'}} />
            <h3>Reviews</h3>
            {reviews.length === 0 && <div>No reviews yet.</div>}
            {reviews.map((r, idx) => (
              <div key={idx} style={{border: '1px solid #eee', borderRadius: 8, padding: '0.5rem', marginBottom: '0.5rem'}}>
                <div><b>Overall:</b> <StarRating rating={r.overall_rating} /></div>
                <div><b>Value:</b> <StarRating rating={r.value_rating} /></div>
                <div><b>Ads:</b> <StarRating rating={r.ad_rating} /></div>
                <div><b>Effort:</b> <StarRating rating={r.effort_rating} /></div>
                <div><b>Enjoyment:</b> <StarRating rating={r.enjoyment_rating} /></div>
                <div><b>Offer Amount:</b> {r.offer_amount}</div>
                <div style={{marginTop: '0.5rem'}}><b>Comment:</b> {r.comment}</div>
                <div style={{fontSize: '0.8rem', color: '#888'}}>Created: {new Date(r.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
