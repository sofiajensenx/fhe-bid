import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import type { AuctionView } from './AuctionApp';

type AuctionCardProps = {
  auction: AuctionView;
  onBid: (id: number, amount: string) => Promise<void>;
  onFinalize: (id: number) => Promise<void>;
  onReveal: (auction: AuctionView) => Promise<void>;
  decrypted?: { highest: string; winner: string };
  isBidPending: boolean;
  isFinalizePending: boolean;
  isRevealPending: boolean;
  isConnected: boolean;
  isZamaReady: boolean;
};

const formatAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

const formatDuration = (seconds: number) => {
  if (seconds <= 0) {
    return 'Ended';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [] as string[];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && hours === 0) parts.push(`${secs}s`);
  return parts.join(' ') || `${secs}s`;
};

export function AuctionCard({
  auction,
  onBid,
  onFinalize,
  onReveal,
  decrypted,
  isBidPending,
  isFinalizePending,
  isRevealPending,
  isConnected,
  isZamaReady,
}: AuctionCardProps) {
  const [bidAmount, setBidAmount] = useState('');

  const now = Math.floor(Date.now() / 1000);
  const endTime = Number(auction.endTime);
  const hasEnded = now >= endTime;

  const statusText = useMemo(() => {
    if (auction.finalized) {
      return 'Finalized';
    }
    return hasEnded ? 'Awaiting finalization' : 'Active';
  }, [auction.finalized, hasEnded]);

  const endsAt = useMemo(() => new Date(endTime * 1000).toLocaleString(), [endTime]);
  const remainingTime = useMemo(() => formatDuration(Math.max(endTime - now, 0)), [endTime, now]);

  const handleBid = async (event: FormEvent) => {
    event.preventDefault();
    if (!bidAmount) return;
    await onBid(auction.id, bidAmount);
    setBidAmount('');
  };

  return (
    <article className="auction-card">
      <header className="auction-card__header">
        <div>
          <h3 className="auction-title">{auction.title}</h3>
          <p className="auction-description">{auction.description || 'No description provided.'}</p>
        </div>
        <span className={`status-badge status-${statusText.toLowerCase().replace(/\s+/g, '-')}`}>
          {statusText}
        </span>
      </header>

      <dl className="auction-meta">
        <div>
          <dt>Seller</dt>
          <dd>{formatAddress(auction.seller)}</dd>
        </div>
        <div>
          <dt>Starting price</dt>
          <dd>{auction.startingPrice.toString()}</dd>
        </div>
        <div>
          <dt>Bids</dt>
          <dd>{auction.bidCount}</dd>
        </div>
        <div>
          <dt>Ends at</dt>
          <dd>{endsAt}</dd>
        </div>
        <div>
          <dt>Time left</dt>
          <dd>{remainingTime}</dd>
        </div>
      </dl>

      <section className="auction-results">
        <h4>Highest Bid</h4>
        {decrypted ? (
          <p className="result-value">{decrypted.highest}</p>
        ) : (
          <p className="result-value">Encrypted</p>
        )}
        <h4>Winner</h4>
        {decrypted ? (
          <p className="result-value">{decrypted.winner}</p>
        ) : (
          <p className="result-value">Encrypted</p>
        )}
      </section>

      <footer className="auction-actions">
        <form className="bid-form" onSubmit={handleBid}>
          <label className="bid-field">
            <span>Bid amount</span>
            <input
              type="number"
              min="1"
              step="1"
              value={bidAmount}
              onChange={(event) => setBidAmount(event.target.value)}
              placeholder="Enter amount"
              disabled={!isConnected || !isZamaReady || auction.finalized || hasEnded || isBidPending}
              required
            />
          </label>
          <button
            className="button"
            type="submit"
            disabled={!isConnected || !isZamaReady || auction.finalized || hasEnded || isBidPending}
          >
            {isBidPending ? 'Submitting…' : 'Place Bid'}
          </button>
        </form>

        <div className="action-buttons">
          <button
            className="button secondary"
            type="button"
            onClick={() => onFinalize(auction.id)}
            disabled={!isConnected || auction.finalized || !hasEnded || isFinalizePending}
          >
            {isFinalizePending ? 'Finalizing…' : 'Finalize Auction'}
          </button>

          <button
            className="button ghost"
            type="button"
            onClick={() => onReveal(auction)}
            disabled={!auction.isResultPublic || isRevealPending || !isZamaReady}
          >
            {isRevealPending ? 'Decrypting…' : 'Decrypt Results'}
          </button>
        </div>
      </footer>
    </article>
  );
}
