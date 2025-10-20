import * as dotenv from "dotenv";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const encryptedAuctionDeployment = await deploy("EncryptedAuction", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedAuction contract:`, encryptedAuctionDeployment.address);
};

export default func;
func.id = "deploy_encryptedAuction"; // id required to prevent reexecution
func.tags = ["EncryptedAuction"];
