import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { EncryptedAuction, EncryptedAuction__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  seller: HardhatEthersSigner;
  bidderOne: HardhatEthersSigner;
  bidderTwo: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedAuction")) as EncryptedAuction__factory;
  const contract = (await factory.deploy()) as EncryptedAuction;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

describe("EncryptedAuction", function () {
  let signers: Signers;
  let contract: EncryptedAuction;
  let contractAddress: string;

  before(async function () {
    const availableSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      seller: availableSigners[0],
      bidderOne: availableSigners[1],
      bidderTwo: availableSigners[2],
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("creates an auction with encrypted starting price", async function () {
    const duration = 3_600;
    const startPrice = 1_000n;

    const tx = await contract
      .connect(signers.seller)
      .createAuction("Vintage Clock", "Rare mantel clock", Number(startPrice), duration);
    await tx.wait();

    const auctionData = await contract.getAuction(1);
    expect(auctionData.seller).to.equal(signers.seller.address);
    expect(auctionData.title).to.equal("Vintage Clock");
    expect(auctionData.startingPrice).to.equal(Number(startPrice));
    expect(auctionData.finalized).to.equal(false);

    const encryptedHighest = await contract.getEncryptedHighestBid(1);
    const decryptedHighest = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedHighest,
      contractAddress,
      signers.seller,
    );

    expect(decryptedHighest).to.equal(startPrice);
  });

  it("tracks the highest encrypted bid", async function () {
    const startPrice = 100n;
    await contract
      .connect(signers.seller)
      .createAuction("Collectible", "Series A", Number(startPrice), 7200);

    // First bid
    const bidOneValue = 250n;
    const encryptedBidOne = await fhevm
      .createEncryptedInput(contractAddress, signers.bidderOne.address)
      .add64(bidOneValue)
      .encrypt();

    await contract
      .connect(signers.bidderOne)
      .placeBid(1, encryptedBidOne.handles[0], encryptedBidOne.inputProof);

    let highest = await contract.getEncryptedHighestBid(1);
    let decryptedHighest = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      highest,
      contractAddress,
      signers.seller,
    );
    expect(decryptedHighest).to.equal(bidOneValue);

    let encryptedWinner = await contract.getEncryptedHighestBidder(1);
    let decryptedWinner = await fhevm.userDecryptEaddress(
      encryptedWinner,
      contractAddress,
      signers.seller,
    );
    expect(decryptedWinner).to.equal(signers.bidderOne.address);

    // Second bid below current highest should not change
    const bidTwoValue = 200n;
    const encryptedBidTwo = await fhevm
      .createEncryptedInput(contractAddress, signers.bidderTwo.address)
      .add64(bidTwoValue)
      .encrypt();

    await contract
      .connect(signers.bidderTwo)
      .placeBid(1, encryptedBidTwo.handles[0], encryptedBidTwo.inputProof);

    highest = await contract.getEncryptedHighestBid(1);
    decryptedHighest = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      highest,
      contractAddress,
      signers.seller,
    );
    expect(decryptedHighest).to.equal(bidOneValue);

    // Third bid above current highest should win
    const bidThreeValue = 375n;
    const encryptedBidThree = await fhevm
      .createEncryptedInput(contractAddress, signers.bidderTwo.address)
      .add64(bidThreeValue)
      .encrypt();

    await contract
      .connect(signers.bidderTwo)
      .placeBid(1, encryptedBidThree.handles[0], encryptedBidThree.inputProof);

    highest = await contract.getEncryptedHighestBid(1);
    decryptedHighest = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      highest,
      contractAddress,
      signers.seller,
    );
    expect(decryptedHighest).to.equal(bidThreeValue);

    encryptedWinner = await contract.getEncryptedHighestBidder(1);
    decryptedWinner = await fhevm.userDecryptEaddress(
      encryptedWinner,
      contractAddress,
      signers.seller,
    );
    expect(decryptedWinner).to.equal(signers.bidderTwo.address);

    const auctionData = await contract.getAuction(1);
    expect(auctionData.bidCount).to.equal(3);
  });

  it("finalizes the auction and exposes public decryption", async function () {
    await contract
      .connect(signers.seller)
      .createAuction("Artwork", "Limited edition", 1_000, 10);

    const bidValue = 5_000n;
    const encryptedBid = await fhevm
      .createEncryptedInput(contractAddress, signers.bidderOne.address)
      .add64(bidValue)
      .encrypt();

    await contract
      .connect(signers.bidderOne)
      .placeBid(1, encryptedBid.handles[0], encryptedBid.inputProof);

    await ethers.provider.send("evm_increaseTime", [20]);
    await ethers.provider.send("evm_mine", []);

    await contract.connect(signers.seller).finalizeAuction(1);

    const resultPublic = await contract.isResultPublic(1);
    expect(resultPublic).to.equal(true);

    const highest = await contract.getEncryptedHighestBid(1);
    const publicHighest = await fhevm.publicDecryptEuint(FhevmType.euint64, highest);
    expect(publicHighest).to.equal(bidValue);

    const encryptedWinner = await contract.getEncryptedHighestBidder(1);
    const publicWinner = await fhevm.publicDecryptEaddress(encryptedWinner);
    expect(publicWinner).to.equal(signers.bidderOne.address);

    const encryptedLateBid = await fhevm
      .createEncryptedInput(contractAddress, signers.bidderTwo.address)
      .add64(6_000n)
      .encrypt();

    await expect(
      contract
        .connect(signers.bidderTwo)
        .placeBid(1, encryptedLateBid.handles[0], encryptedLateBid.inputProof),
    )
      .to.be.revertedWithCustomError(contract, "AuctionAlreadyFinalized")
      .withArgs(1);
  });
});
