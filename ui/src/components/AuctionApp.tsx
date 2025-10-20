import { useCallback, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Contract } from 'ethers';

import { CONTRACT_ABI, CONTRACT_ADDRESS, HAS_CONTRACT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { AuctionCreator } from './AuctionCreator';
import { AuctionList } from './AuctionList';
import { Header } from './Header';

export type AuctionView = {
  id: number;
  seller: string;
  title: string;
  description: string;
  startingPrice: bigint;
  endTime: bigint;
  finalized: boolean;
  bidCount: number;
  isResultPublic: boolean;
  highestHandle: string;
  winnerHandle: string;
};

type DecryptedResults = Record<number, { highest: string; winner: string }>; 

export function AuctionApp() {
  const { address } = useAccount();
  const signer = useEthersSigner();
  const { instance, isLoading: isZamaLoading, error: zamaError } = useZamaInstance();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingBidId, setPendingBidId] = useState<number | null>(null);
  const [pendingFinalizeId, setPendingFinalizeId] = useState<number | null>(null);
  const [pendingRevealId, setPendingRevealId] = useState<number | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [decryptedResults, setDecryptedResults] = useState<DecryptedResults>({});

  const isConnected = Boolean(address);

  const fetchAuctions = useCallback(async () => {
    if (!publicClient || !HAS_CONTRACT_ADDRESS) {
      return [] as AuctionView[];
    }

    const countBigInt = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'getAuctionCount',
    })) as bigint;

    const total = Number(countBigInt);
    if (!Number.isFinite(total) || total === 0) {
      return [] as AuctionView[];
    }

    const ids = Array.from({ length: total }, (_, index) => index + 1);

    const auctions = await Promise.all(
      ids.map(async (id) => {
        const [auctionRaw, isResultPublic, highestHandle, winnerHandle] = await Promise.all([
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getAuction',
            args: [BigInt(id)],
          }),
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'isResultPublic',
            args: [BigInt(id)],
          }),
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getEncryptedHighestBid',
            args: [BigInt(id)],
          }),
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getEncryptedHighestBidder',
            args: [BigInt(id)],
          }),
        ]);

        const seller = auctionRaw[0] as string;
        const title = auctionRaw[1] as string;
        const description = auctionRaw[2] as string;
        const startingPrice = auctionRaw[3] as bigint;
        const endTime = auctionRaw[4] as bigint;
        const finalized = auctionRaw[5] as boolean;
        const bidCountValue = auctionRaw[6] as bigint | number;

        const bidCount = typeof bidCountValue === 'bigint' ? Number(bidCountValue) : bidCountValue;

        return {
          id,
          seller,
          title,
          description,
          startingPrice,
          endTime,
          finalized,
          bidCount,
          isResultPublic: Boolean(isResultPublic),
          highestHandle: highestHandle as string,
          winnerHandle: winnerHandle as string,
        } satisfies AuctionView;
      }),
    );

    return auctions;
  }, [publicClient]);

  const { data: auctions = [], isLoading, isFetching } = useQuery({
    queryKey: ['auctions'],
    queryFn: fetchAuctions,
    refetchInterval: 15000,
    enabled: Boolean(publicClient && HAS_CONTRACT_ADDRESS),
  });

  const refreshAuctions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['auctions'] });
  }, [queryClient]);

  const clearMessages = useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const createAuction = useCallback(
    async (input: { title: string; description: string; startingPrice: string; duration: string }) => {
      clearMessages();
      if (!signer) {
        setErrorMessage('Connect your wallet to create an auction.');
        return;
      }
      if (!HAS_CONTRACT_ADDRESS) {
        setErrorMessage('Contract address is not configured. Set VITE_CONTRACT_ADDRESS in the frontend environment.');
        return;
      }

      const priceValue = BigInt(input.startingPrice);
      if (priceValue < 0n) {
        setErrorMessage('Starting price must be positive.');
        return;
      }
      if (priceValue > 2n ** 64n - 1n) {
        setErrorMessage('Starting price exceeds 64-bit limit.');
        return;
      }

      const durationValue = Number(input.duration);
      if (!Number.isFinite(durationValue) || durationValue <= 0) {
        setErrorMessage('Duration must be a positive number of seconds.');
        return;
      }

      setCreatePending(true);
      try {
        const signerInstance = await signer;
        const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerInstance);
        const tx = await contract.createAuction(
          input.title.trim(),
          input.description.trim(),
          priceValue,
          BigInt(durationValue),
        );
        setStatusMessage('Submitting auction creation...');
        await tx.wait();
        setStatusMessage('Auction created successfully.');
        setDecryptedResults({});
        refreshAuctions();
      } catch (error) {
        console.error(error);
        setErrorMessage('Failed to create auction. Check console for details.');
      } finally {
        setCreatePending(false);
      }
    },
    [clearMessages, refreshAuctions, signer],
  );

  const placeBid = useCallback(
    async (auctionId: number, amount: string) => {
      clearMessages();
      if (!signer || !address) {
        setErrorMessage('Connect your wallet before placing a bid.');
        return;
      }
      if (!instance) {
        setErrorMessage('Encryption service not ready.');
        return;
      }
      if (!HAS_CONTRACT_ADDRESS) {
        setErrorMessage('Contract address is not configured. Set VITE_CONTRACT_ADDRESS in the frontend environment.');
        return;
      }

      let bidValue: bigint;
      try {
        bidValue = BigInt(amount);
      } catch (error) {
        console.error(error);
        setErrorMessage('Enter a valid numeric bid amount.');
        return;
      }

      if (bidValue <= 0n) {
        setErrorMessage('Bid amount must be greater than zero.');
        return;
      }
      if (bidValue > 2n ** 64n - 1n) {
        setErrorMessage('Bid amount exceeds 64-bit limit.');
        return;
      }

      setPendingBidId(auctionId);

      try {
        const buffer = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
        buffer.add64(bidValue);
        const encrypted = await buffer.encrypt();

        const signerInstance = await signer;
        const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerInstance);
        const tx = await contract.placeBid(auctionId, encrypted.handles[0], encrypted.inputProof);
        setStatusMessage('Submitting encrypted bid...');
        await tx.wait();
        setStatusMessage('Bid submitted successfully.');
        refreshAuctions();
      } catch (error) {
        console.error(error);
        setErrorMessage('Failed to place bid. Check console for details.');
      } finally {
        setPendingBidId(null);
      }
    },
    [address, clearMessages, instance, refreshAuctions, signer],
  );

  const finalizeAuction = useCallback(
    async (auctionId: number) => {
      clearMessages();
      if (!signer) {
        setErrorMessage('Connect your wallet to finalize the auction.');
        return;
      }
      if (!HAS_CONTRACT_ADDRESS) {
        setErrorMessage('Contract address is not configured. Set VITE_CONTRACT_ADDRESS in the frontend environment.');
        return;
      }

      setPendingFinalizeId(auctionId);
      try {
        const signerInstance = await signer;
        const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerInstance);
        const tx = await contract.finalizeAuction(auctionId);
        setStatusMessage('Finalizing auction...');
        await tx.wait();
        setStatusMessage('Auction finalized. Results can now be decrypted.');
        refreshAuctions();
      } catch (error) {
        console.error(error);
        setErrorMessage('Failed to finalize auction. Check console for details.');
      } finally {
        setPendingFinalizeId(null);
      }
    },
    [clearMessages, refreshAuctions, signer],
  );

  const revealResults = useCallback(
    async (auction: AuctionView) => {
      clearMessages();
      if (!instance) {
        setErrorMessage('Encryption service not ready.');
        return;
      }
      if (!auction.isResultPublic) {
        setErrorMessage('Auction results are not public yet.');
        return;
      }

      setPendingRevealId(auction.id);
      try {
        const response = await instance.publicDecrypt([
          auction.highestHandle,
          auction.winnerHandle,
        ]);
        const highestValue = response[auction.highestHandle];
        const winnerValue = response[auction.winnerHandle];

        setDecryptedResults((prev) => ({
          ...prev,
          [auction.id]: {
            highest: highestValue?.toString() ?? '0',
            winner: typeof winnerValue === 'string' ? winnerValue : String(winnerValue),
          },
        }));
        setStatusMessage('Results decrypted successfully.');
      } catch (error) {
        console.error(error);
        setErrorMessage('Failed to decrypt auction results. Check console for details.');
      } finally {
        setPendingRevealId(null);
      }
    },
    [clearMessages, instance],
  );

  const isBusy = useMemo(
    () => isLoading || isFetching || pendingBidId !== null || pendingFinalizeId !== null || createPending,
    [createPending, isFetching, isLoading, pendingBidId, pendingFinalizeId],
  );

  return (
    <div className="app-wrapper">
      <Header />
      <main className="app-main">
        <section className="app-section">
          <h2 className="section-title">Create Auction</h2>
          <AuctionCreator onCreate={createAuction} isSubmitting={createPending} isConnected={isConnected} isZamaLoading={isZamaLoading} />
        </section>

        {statusMessage && <div className="feedback success">{statusMessage}</div>}
        {(errorMessage || zamaError) && (
          <div className="feedback error">{errorMessage ?? zamaError}</div>
        )}

        <section className="app-section">
          <div className="section-header">
            <h2 className="section-title">Auctions</h2>
            {isBusy && <span className="section-status">Updating...</span>}
          </div>
          <AuctionList
            auctions={auctions}
            onBid={placeBid}
            onFinalize={finalizeAuction}
            onReveal={revealResults}
            decrypted={decryptedResults}
            bidPendingId={pendingBidId}
            finalizePendingId={pendingFinalizeId}
            revealPendingId={pendingRevealId}
            isConnected={isConnected}
            isZamaReady={!isZamaLoading && !zamaError}
          />
        </section>
      </main>
    </div>
  );
}
