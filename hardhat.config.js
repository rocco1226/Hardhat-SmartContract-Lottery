require("hardhat-deploy")
require("hardhat-contract-sizer")
require("dotenv").config()
require("@nomicfoundation/hardhat-toolbox")
require("@nomicfoundation/hardhat-ethers") //getContractAt \ getSigner \ getSigners
require("@nomicfoundation/hardhat-chai-matchers")
require("hardhat-gas-reporter")

// According to the hardhat documentation, the following plugins are included in the toolbox:
// @nomicfoundation/hardhat-ethers
// @nomicfoundation/hardhat-verify
// hardhat-gas-reporter
// solidity-coverage
// @typechain/hardhat
// 这些已包含于toolbox中

const SEPOLIA_URL = process.env.SEPOLIA_URL //测试网远程过程调用资源定位符
const PRIVATE_KEY = process.env.PRIVATE_KEY //私钥
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY //用以获取gas-reporter的法币价值
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY //用以验证合约源代码

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        compilers: [{ version: "0.8.8" }, { version: "0.6.6" }],
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 31337,
            blockConfirmations: 1,
        },
        localhost: {
            chainId: 31337,
        },
        sepolia: {
            chainId: 11155111,
            blockConfirmations: 6,
            url: SEPOLIA_URL,
            accounts: [PRIVATE_KEY],
        },
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
        player: {
            default: 0,
        },
    }, //from hardhat-deploy
    gasReporter: {
        enabled: false,
        currency: "CNY",
        outputFile: "gas-reporter.txt",
        noColors: true,
        // coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    },
    mocha: { timeout: 300000 },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    },
}
