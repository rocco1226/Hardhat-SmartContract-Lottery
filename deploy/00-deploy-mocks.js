//用处：用于部署mock合约，用于本地测试

const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { network, ethers } = require("hardhat")

const BASE_FEE = ethers.parseEther("0.25") //0.25为基础费用，0.25LINK
const GAS_PRICE_LINK = 1e9 //BASE_FEE和GAS_PRICE_LINK是VRFCoordinatorMock的构造函数参数
const args = [BASE_FEE, GAS_PRICE_LINK]

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    if (developmentChains.includes(network.name)) {
        log("Local network detected, deploying mocks...")
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        })
        log("VRFCoordinatorV2Mock deployed")
        log("--------------------------------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]
