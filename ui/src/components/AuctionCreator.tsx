import type { FormEvent } from 'react';
import { useState } from 'react';

type AuctionCreatorProps = {
  onCreate: (input: {
    title: string;
    description: string;
    startingPrice: string;
    duration: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  isConnected: boolean;
  isZamaLoading: boolean;
};

const DEFAULT_DURATION = '86400';

export function AuctionCreator({ onCreate, isSubmitting, isConnected, isZamaLoading }: AuctionCreatorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingPrice, setStartingPrice] = useState('100');
  const [duration, setDuration] = useState(DEFAULT_DURATION);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onCreate({ title, description, startingPrice, duration });
  };

  return (
    <div className="card">
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="form-field">
            <span className="form-label">Title</span>
            <input
              className="form-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Auction title"
              required
              maxLength={80}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Starting Price</span>
            <input
              className="form-input"
              type="number"
              min="0"
              step="1"
              value={startingPrice}
              onChange={(event) => setStartingPrice(event.target.value)}
              required
            />
          </label>

          <label className="form-field">
            <span className="form-label">Duration (seconds)</span>
            <input
              className="form-input"
              type="number"
              min="60"
              step="60"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              required
            />
          </label>
        </div>

        <label className="form-field">
          <span className="form-label">Description</span>
          <textarea
            className="form-textarea"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add helpful details about the item"
            maxLength={280}
          />
        </label>

        <div className="form-footer">
          {!isConnected && <span className="hint">Connect your wallet to create auctions.</span>}
          {isZamaLoading && <span className="hint">Preparing encryption toolkit…</span>}
          <button className="button" type="submit" disabled={!isConnected || isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Auction'}
          </button>
        </div>
      </form>
    </div>
  );
}
