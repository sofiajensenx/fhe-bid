import * as dotenv from "dotenv";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const isLocalNetwork = ["hardhat", "anvil"].includes(hre.network.name);

  if (!isLocalNetwork) {
    if (!process.env.DEPLOYER_PRIVATE_KEY) {
      throw new Error("DEPLOYER_PRIVATE_KEY must be set for live deployments.");
    }

    if (!process.env.INFURA_API_KEY) {
      throw new Error("INFURA_API_KEY must be set for live deployments.");
    }
  }

  const encryptedAuctionDeployment = await deploy("EncryptedAuction", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedAuction contract:`, encryptedAuctionDeployment.address);
};

export default func;
func.id = "deploy_encryptedAuction"; // id required to prevent reexecution
func.tags = ["EncryptedAuction"];
