import type { AuctionView } from './AuctionApp';
import { AuctionCard } from './AuctionCard';

type AuctionListProps = {
  auctions: AuctionView[];
  onBid: (id: number, amount: string) => Promise<void>;
  onFinalize: (id: number) => Promise<void>;
  onReveal: (auction: AuctionView) => Promise<void>;
  decrypted: Record<number, { highest: string; winner: string }>; 
  bidPendingId: number | null;
  finalizePendingId: number | null;
  revealPendingId: number | null;
  isConnected: boolean;
  isZamaReady: boolean;
};

export function AuctionList({
  auctions,
  onBid,
  onFinalize,
  onReveal,
  decrypted,
  bidPendingId,
  finalizePendingId,
  revealPendingId,
  isConnected,
  isZamaReady,
}: AuctionListProps) {
  if (!auctions.length) {
    return <div className="card">No auctions have been created yet. Be the first!</div>;
  }

  return (
    <div className="auction-grid">
      {auctions.map((auction) => (
        <AuctionCard
          key={auction.id}
          auction={auction}
          onBid={onBid}
          onFinalize={onFinalize}
          onReveal={onReveal}
          decrypted={decrypted[auction.id]}
          isBidPending={bidPendingId === auction.id}
          isFinalizePending={finalizePendingId === auction.id}
          isRevealPending={revealPendingId === auction.id}
          isConnected={isConnected}
          isZamaReady={isZamaReady}
        />
      ))}
    </div>
  );
}
