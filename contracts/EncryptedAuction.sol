// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {
    FHE,
    euint64,
    eaddress,
    ebool,
    externalEuint64
} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title EncryptedAuction
/// @notice Confidential auction contract where bids remain encrypted until completion.
contract EncryptedAuction is SepoliaConfig {
    struct Auction {
        address seller;
        string title;
        string description;
        uint64 startingPrice;
        uint256 endTime;
        bool finalized;
        uint32 bidCount;
        euint64 highestBid;
        eaddress highestBidder;
    }

    uint256 private _auctionCounter;
    mapping(uint256 => Auction) private _auctions;

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        string title,
        uint64 startingPrice,
        uint256 endTime
    );

    event BidPlaced(uint256 indexed auctionId, address indexed bidder);
    event AuctionFinalized(uint256 indexed auctionId);

    error AuctionNotFound(uint256 auctionId);
    error AuctionStillActive(uint256 auctionId, uint256 endTime);
    error AuctionAlreadyFinalized(uint256 auctionId);
    error InvalidDuration();
    error EmptyTitle();

    /// @notice Creates a new auction.
    /// @param title Short description of the item being auctioned.
    /// @param description Additional details about the item.
    /// @param startingPrice Minimum acceptable price expressed in wei.
    /// @param duration Duration in seconds before the auction ends.
    /// @return auctionId Identifier of the newly created auction.
    function createAuction(
        string calldata title,
        string calldata description,
        uint64 startingPrice,
        uint256 duration
    ) external returns (uint256 auctionId) {
        if (bytes(title).length == 0) {
            revert EmptyTitle();
        }
        if (duration == 0) {
            revert InvalidDuration();
        }

        auctionId = ++_auctionCounter;
        Auction storage auction = _auctions[auctionId];

        auction.seller = msg.sender;
        auction.title = title;
        auction.description = description;
        auction.startingPrice = startingPrice;
        auction.endTime = block.timestamp + duration;

        euint64 initialHighest = FHE.asEuint64(startingPrice);
        auction.highestBid = FHE.allowThis(initialHighest);
        auction.highestBid = FHE.allow(auction.highestBid, msg.sender);

        eaddress initialBidder = FHE.asEaddress(address(0));
        auction.highestBidder = FHE.allowThis(initialBidder);
        auction.highestBidder = FHE.allow(auction.highestBidder, msg.sender);

        emit AuctionCreated(auctionId, msg.sender, title, startingPrice, auction.endTime);
    }

    /// @notice Places an encrypted bid on a specific auction.
    /// @param auctionId Identifier of the auction.
    /// @param encryptedBid Encrypted bid value handle obtained from the relayer.
    /// @param inputProof Proof generated alongside the encrypted bid.
    function placeBid(
        uint256 auctionId,
        externalEuint64 encryptedBid,
        bytes calldata inputProof
    ) external {
        Auction storage auction = _requireAuction(auctionId);
        if (auction.finalized) {
            revert AuctionAlreadyFinalized(auctionId);
        }
        if (block.timestamp >= auction.endTime) {
            revert AuctionStillActive(auctionId, auction.endTime);
        }

        euint64 bidValue = FHE.fromExternal(encryptedBid, inputProof);

        ebool isHigher = FHE.gt(bidValue, auction.highestBid);

        euint64 updatedHighest = FHE.select(isHigher, bidValue, auction.highestBid);
        updatedHighest = FHE.allowThis(updatedHighest);
        updatedHighest = FHE.allow(updatedHighest, auction.seller);
        auction.highestBid = updatedHighest;

        eaddress bidderAddress = FHE.asEaddress(msg.sender);
        eaddress updatedBidder = FHE.select(isHigher, bidderAddress, auction.highestBidder);
        updatedBidder = FHE.allowThis(updatedBidder);
        updatedBidder = FHE.allow(updatedBidder, auction.seller);
        auction.highestBidder = updatedBidder;

        auction.bidCount += 1;

        emit BidPlaced(auctionId, msg.sender);
    }

    /// @notice Finalizes the auction and makes the winning bid publicly decryptable.
    /// @param auctionId Identifier of the auction to finalize.
    function finalizeAuction(uint256 auctionId) external {
        Auction storage auction = _requireAuction(auctionId);
        if (auction.finalized) {
            revert AuctionAlreadyFinalized(auctionId);
        }
        if (block.timestamp < auction.endTime) {
            revert AuctionStillActive(auctionId, auction.endTime);
        }

        auction.highestBid = FHE.makePubliclyDecryptable(auction.highestBid);
        auction.highestBidder = FHE.makePubliclyDecryptable(auction.highestBidder);
        auction.finalized = true;

        emit AuctionFinalized(auctionId);
    }

    /// @notice Provides aggregate information for a specific auction.
    function getAuction(
        uint256 auctionId
    )
        external
        view
        returns (
            address seller,
            string memory title,
            string memory description,
            uint64 startingPrice,
            uint256 endTime,
            bool finalized,
            uint32 bidCount
        )
    {
        Auction storage auction = _requireAuctionView(auctionId);
        return (
            auction.seller,
            auction.title,
            auction.description,
            auction.startingPrice,
            auction.endTime,
            auction.finalized,
            auction.bidCount
        );
    }

    /// @notice Returns the encrypted highest bid for a given auction.
    function getEncryptedHighestBid(uint256 auctionId) external view returns (euint64) {
        Auction storage auction = _requireAuctionView(auctionId);
        return auction.highestBid;
    }

    /// @notice Returns the encrypted highest bidder address for a given auction.
    function getEncryptedHighestBidder(uint256 auctionId) external view returns (eaddress) {
        Auction storage auction = _requireAuctionView(auctionId);
        return auction.highestBidder;
    }

    /// @notice Indicates whether the final results are publicly decryptable.
    function isResultPublic(uint256 auctionId) external view returns (bool) {
        Auction storage auction = _requireAuctionView(auctionId);
        return auction.finalized && FHE.isPubliclyDecryptable(auction.highestBid);
    }

    /// @notice Returns the total amount of created auctions.
    function getAuctionCount() external view returns (uint256) {
        return _auctionCounter;
    }

    function _requireAuction(uint256 auctionId) private view returns (Auction storage auction) {
        auction = _auctions[auctionId];
        if (auction.seller == address(0)) {
            revert AuctionNotFound(auctionId);
        }
    }

    function _requireAuctionView(uint256 auctionId) private view returns (Auction storage auction) {
        auction = _auctions[auctionId];
        if (auction.seller == address(0)) {
            revert AuctionNotFound(auctionId);
        }
    }
}
