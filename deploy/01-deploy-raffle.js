//用处：部署Raffle合约

const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const VRF_SUB_FUND_AMOUNT = ethers.parseEther("30")

module.exports = async function (hre) {
    /* 获取部署环境 */
    const { getNamedAccounts, deployments } = hre
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId //network是hardhat的工具，用以获取在hardhat.config.js中配置的chainId

    /* 构造函数参数*/
    let vrfCoordinatorV2Address, subscriptionId, vrfCoordinatorV2Mock

    if (developmentChains.includes(network.name)) {
        /* 如果是开发链 */
        vrfCoordinatorV2Address = (await deployments.get("VRFCoordinatorV2Mock")).address
        vrfCoordinatorV2Mock = await ethers.getContractAt(
            "VRFCoordinatorV2Mock",
            vrfCoordinatorV2Address,
        )
        //getContract已被弃用
        //vrfCoordinatorV2Address = vrfCoordinatorV2Mock.target
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.logs[0].args.subId
        //获取订阅ID  subscriptionId = transactionReceipt.events[0].args.subId;似乎是ethers v5的写法 transactionReceipt.logs[0].topics[1]在ether v6中也是可行的，这种写法更加底层，不具备很高的稳健性
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        /* 如果是测试网或真实网 */
        vrfCoordinatorV2Address = networkConfig[chainId].vrfCoordinatorV2 //networkConfig是在helper-hardhat-config.js中定义的，用以获取vrfCoordinatorV2的地址
        subscriptionId = networkConfig[chainId].subscriptionId
    }

    const entranceFee = networkConfig[chainId].entranceFee
    const gasLane = networkConfig[chainId].gasLane
    const callbackGasLimit = networkConfig[chainId].callbackGasLimit
    const interval = networkConfig[chainId].interval
    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval,
    ]
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args, //参数
        log: true,
        waitConformations: network.config.blockConfirmations || 1,
    })

    if (developmentChains.includes(network.name)) {
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
        log("Consumer is added")
    } //如果是开发链，将raffle合约添加为vrfCoordinatorV2Mock的消费者

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(raffle.address, args) //这里没有用到ethers v6，因为raffle似乎是通过hardhat-deploy插件部署，而不是ethers v6，所以它的地址应该是address，而不是target
    }

    log("--------------------------------------------------------------")
}

module.exports.tags = ["all", "raffle"]
