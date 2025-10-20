import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:auction-address", "Prints the EncryptedAuction deployment address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const deployment = await deployments.get("EncryptedAuction");
    console.log(`EncryptedAuction address: ${deployment.address}`);
  },
);

task("task:auction-create", "Creates a new auction")
  .addParam("title", "Auction title")
  .addParam("description", "Auction description")
  .addParam("price", "Starting price as an integer")
  .addParam("duration", "Duration in seconds")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("EncryptedAuction");
    const contract = await ethers.getContractAt("EncryptedAuction", deployment.address);

    const price = BigInt(taskArguments.price);
    const duration = Number(taskArguments.duration);

    const signer = (await ethers.getSigners())[0];
    const tx = await contract
      .connect(signer)
      .createAuction(taskArguments.title, taskArguments.description, price, duration);
    console.log(`Creating auction. tx: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      console.log("Auction creation failed");
      return;
    }
    console.log("Auction created successfully");
  });

task("task:auction-info", "Reads auction details")
  .addParam("id", "Auction identifier")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("EncryptedAuction");
    const contract = await ethers.getContractAt("EncryptedAuction", deployment.address);

    const auctionId = Number(taskArguments.id);
    const auction = await contract.getAuction(auctionId);
    console.log(`Auction #${auctionId}`);
    console.log(`  Seller        : ${auction.seller}`);
    console.log(`  Title         : ${auction.title}`);
    console.log(`  Description   : ${auction.description}`);
    console.log(`  Starting price: ${auction.startingPrice}`);
    console.log(`  End time      : ${auction.endTime}`);
    console.log(`  Finalized     : ${auction.finalized}`);
    console.log(`  Bid count     : ${auction.bidCount}`);
  });

task("task:auction-public-results", "Displays public highest bid and winner")
  .addParam("id", "Auction identifier")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("EncryptedAuction");
    const contract = await ethers.getContractAt("EncryptedAuction", deployment.address);

    const auctionId = Number(taskArguments.id);
    const isPublic = await contract.isResultPublic(auctionId);
    if (!isPublic) {
      console.log(`Auction #${auctionId} results are not public yet.`);
      return;
    }

    const encryptedHighest = await contract.getEncryptedHighestBid(auctionId);
    const encryptedWinner = await contract.getEncryptedHighestBidder(auctionId);

    const highest = await fhevm.publicDecryptEuint(FhevmType.euint64, encryptedHighest);
    const winner = await fhevm.publicDecryptEaddress(encryptedWinner);

    console.log(`Auction #${auctionId} public results`);
    console.log(`  Highest bid : ${highest}`);
    console.log(`  Winner      : ${winner}`);
  });
