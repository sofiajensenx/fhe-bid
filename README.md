# Encrypted FHE Auction

Confidential auctions with fully homomorphic encryption (FHE) that keep bids private until the auction closes. Sellers create listings on-chain, bidders submit encrypted prices, and the contract reveals the highest bid and winner only after finalization.

---

## Overview

The project demonstrates how Zama’s FHEVM makes privacy-preserving markets possible. Every auction is handled by the `EncryptedAuction` smart contract, while a modern React + Vite interface guides users through creating auctions, placing encrypted bids, finalizing results, and decrypting the winner once the auction ends. The stack is production-ready, using Hardhat for development, a Zama relayer for proof generation, `ethers` for writes, and `viem` via wagmi for public reads.

---

## Key Advantages

- **Confidential bidding**: Bid values stay encrypted on-chain until the seller finalizes the auction, preventing front-running or price leakage.
- **Fair settlement**: After finalization, only the highest bid and the winner’s address become publicly decryptable, ensuring verifiability without exposing every bid.
- **Composable tooling**: Built with Hardhat, wagmi, RainbowKit, and React Query, making integration into existing Ethereum workflows straightforward.
- **Explicit privacy permissions**: The contract restricts who can decrypt intermediate data, guaranteeing that only the seller can monitor progress before the public reveal.
- **Scalable foundation**: Designed to support multiple simultaneous auctions with efficient read paths and periodic refresh through React Query.

---

## Problems We Solve

- **Price confidentiality in public blockchains**: Traditional auctions expose bids or rely on complex commit–reveal schemes. FHE keeps values encrypted end-to-end.
- **Trust minimization for sellers and bidders**: All logic is enforced by the smart contract; neither party relies on an off-chain service for determining the winner.
- **User experience for FHE**: The relayer integration abstracts cryptographic complexity, allowing bids to be submitted with a familiar wallet flow.
- **Replayable audit trail**: Events and public state remain accessible for analytics without compromising sensitive bid amounts.

---

## Architecture & Tech Stack

- **Smart Contracts**: Solidity `0.8.27` with `@fhevm/solidity`. Hardhat + `hardhat-deploy` manage compilation and deployments across local and Sepolia networks.
- **Frontend**: React 18 + Vite + TypeScript, wagmi for viem-powered reads, `ethers` for writes, RainbowKit for wallet onboarding, and React Query for caching.
- **Encryption Layer**: Zama FHEVM relayer handles ciphertext creation (`createEncryptedInput`) and public decryption routines (`publicDecrypt`).
- **Testing & Tooling**: Hardhat tasks, scripts in `deploy/`, and comprehensive unit tests in `test/` ensure deterministic behavior.
- **State & Data Flow**: Auctions are fetched via read-only `viem` calls, while mutation paths use an `ethers.Contract` instance bound to the connected signer.

Repository layout highlights:

```
contracts/            Solidity sources (EncryptedAuction)
deploy/               Network-specific deployment scripts
deployments/          Saved artifacts per network (ABI for frontend consumption)
tasks/                Custom Hardhat tasks
test/                 Smart-contract test suites
ui/                   React dApp consuming on-chain data and Zama services
```

---

## Smart Contract Highlights

- **`createAuction`**: Sellers specify title, description, starting price, and duration; the contract stores encrypted placeholders for highest bid and bidder.
- **`placeBid`**: Bidders submit ciphertext handles and proofs from the relayer. The contract compares encrypted values and updates encrypted winners atomically.
- **`finalizeAuction`**: Once `block.timestamp` passes `endTime`, the seller (or anyone) can finalize, making the highest bid and winner publicly decryptable.
- **Read APIs**: `getAuction`, `getEncryptedHighestBid`, `getEncryptedHighestBidder`, `isResultPublic`, and `getAuctionCount` power the frontend without revealing sensitive data prematurely.
- **Security considerations**: Input validation catches empty titles, zero durations, and ensures bid limits stay within `uint64` to align with FHE ciphertext constraints.

---

## Frontend Experience

- **Auction creation**: Guided form validates price and duration before invoking `createAuction` through an `ethers` signer connection.
- **Encrypted bidding**: The UI requests ciphertext generation from the Zama instance and submits both the FHE handle and proof to the contract.
- **Finalize & reveal**: Sellers finalize auctions on-chain; once public, any user can call the relayer to decrypt the highest bid and winning address.
- **Real-time updates**: React Query polls the contract every 15 seconds to keep auction lists, bid counts, and public status fresh.

---

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   cd ui && npm install
   ```

2. **Configure environment**
   - Copy the provided `.env` template (if present) and ensure `process.env.INFURA_API_KEY` is available for the Hardhat config.
   - Run `import * as dotenv from "dotenv"; dotenv.config();` in scripts requiring environment variables (already present in the repo; verify before deployment).
   - Place your deployer private key in the expected variable (`PRIVATE_KEY`) for Sepolia deployment. Do **not** use a mnemonic.

3. **Compile and test contracts**
   ```bash
   npm run compile
   npm run test
   ```

4. **Start an FHE-ready local node**
   ```bash
   npx hardhat node
   ```

5. **Deploy locally**
   ```bash
   npx hardhat deploy --network localhost
   ```

6. **Run the frontend**
   ```bash
   cd ui
   npm run dev
   ```
   The UI interacts with the local node and relayer; ensure the relayer is configured according to `docs/zama_doc_relayer.md`.

7. **Deploy to Sepolia**
   ```bash
   npx hardhat deploy --network sepolia
   ```
   After successful deployment, copy the generated ABI and addresses from `deployments/sepolia` into `ui/src/config/contracts.ts`.

---

## Bidding Lifecycle

1. **Create**: Seller submits listing metadata plus timing. Contract initializes encrypted placeholders with the starting price.
2. **Bid**: Bidders encrypt their amount off-chain, submit the ciphertext, and the contract updates the running maximum completely on-chain.
3. **Finalize**: After the deadline, the seller (or anyone) finalizes the auction, promoting the stored ciphertext to a publicly decryptable state.
4. **Reveal**: Any user requests public decryption from the Zama relayer to display the highest bid and winner inside the UI.

---

## Deployment Notes

- **Hardhat vars**: Use `npx hardhat vars set INFURA_API_KEY` before Sepolia tasks. Additional secrets are managed through the native Hardhat vars system.
- **ABI discipline**: Always sync the latest contract ABI from `deployments/<network>` to the frontend to prevent signature mismatches.
- **Signer configuration**: The deploy script expects a private key (`process.env.PRIVATE_KEY`) and fails fast if it is missing.
- **No tailwind / env usage**: Styling relies on CSS modules inside `ui/src/styles`. Frontend configuration is TypeScript-based to comply with project constraints (no `.env` usage in the UI bundle).

---

## Testing & Tooling

- **Unit tests**: Found under `test/`, covering auction creation, bidding, finalization, and encrypted data handling edge cases.
- **Tasks**: Custom Hardhat tasks in `tasks/` assist with inspection, seeding auctions, and verifying on-chain data.
- **Scripts**: The `deploy/` folder contains deployment flows for localhost and Sepolia, encapsulating verification-ready steps.
- **Formatting**: Follow configured ESLint and Prettier rules (`npm run lint`) for the frontend; Solidity sources align with Hardhat defaults.

---

## Future Roadmap

- **Multi-asset support**: Allow auctions to accept ERC-20 payments and integrate settlement logic post-finalization.
- **Advanced analytics**: Add dashboards that visualize bid activity while preserving privacy through aggregated metrics.
- **Access control extensions**: Optional allowlists or KYC integrations (external) while keeping the core contract permissionless.
- **Batch finalization**: Optimize gas costs for sellers managing several auctions simultaneously.
- **Progressive disclosure**: Enable partial reveals (e.g., top N bids) governed by additional encrypted policies.

---

## Additional Resources

- [Zama FHEVM Documentation](https://docs.zama.ai/fhevm)
- Project-specific relayer guidance: `docs/zama_doc_relayer.md`
- On-chain configuration references: `docs/zama_llm.md`

---

This repository brings together privacy-preserving smart contracts and a production-grade dApp so builders can deliver real-world encrypted auctions end-to-end.
