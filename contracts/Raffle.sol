//Raffle
//Entering the lottery (paying some amount)
//Pick a random winer(verifiable random)
//Winner to be selected every X minutes -> completely automate
//Chainlink Oracle -> Randomness, Automated Execution

//SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol"; //引入VRFCoordinatorV2Interface合约
import "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UPkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/**
 * @title A sample Raffle contract using Chainlink VRF
 * @author Rocco Z
 * @notice This contract is for creating a untamperable decentralized smart contract lottery
 * @dev This implements ChainlinkVRFV2 and Chainlink Keepers
 */

contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface {
    /* Type decalrations */
    enum RaffleState {
        OPEN,
        CALCULATING
    } //枚举，创建了一种新的数据类型叫做RaffleState，uint256 0=OPEN,1=CALCULATING

    /* state variables */
    uint256 private immutable i_entranceFee;
    address payable[] private s_players; //address should also be payable similar to payable function
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator; //合约接口实例化
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;

    /* Lottery Variables */
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    /* events */
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed Winner);

    /* Founctions */
    constructor(
        address vrfCoordinatorV2, //contract address(意味着我们需要MOCK来模拟这个合约)
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        //构造函数修饰器，将地址vrfCoordinatorV2传递给VRFConsumerBaseV2的构造函数
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        // require(msg.value>=i_entranceFee, "Not enough ETH to enter the raffle")
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        s_players.push(payable(msg.sender));
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        emit RaffleEnter(msg.sender);
        //events
    }

    /**
     * @dev 这个函数将由Chainlink Keepers节点调用，以检查UpkeepNeeded是否返回true
     * upkeepNeeded返回true时，链上的链下工作节点将调用performUpkeep
     * 下面的要求达成时，upkeepNeeded返回true
     * 1.我们所定义的间隔时间已经过去
     * 2.至少有一位玩家参与了抽奖
     * 3.我们的subscription有充足的LINK
     * 4.彩票需要时OPEN状态
     */

    function checkUpkeep(
        bytes memory /* checkData */
    ) public override returns (bool upkeepNeeded, bytes memory /*performData*/) {
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = (address(this).balance > 0);
        upkeepNeeded = isOpen && timePassed && hasPlayers && hasBalance;
        return (upkeepNeeded, "0x0");
    }

    function performUpkeep(bytes calldata /* performData */) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UPkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRaffleWinner(requestId); //标识请求

        //2 transaction process to avoid mocking the randomness by violence
    } //这个函数将被chainlink keepers网络调用，这样它就可以自动运行而无需我们手动干预

    function fulfillRandomWords(
        uint256,
        /* requestId */ uint256[] memory randomWords
    ) internal override {
        uint256 IndexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[IndexOfWinner]; //获胜者地址
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    //交互是不需要重新实现的，所以我们把交互功能交给vrfCoordinatorV2，然后引入该接口，实例化，调用该接口的函数与vrfCoordinatorV2通信，然后vrfCoordinatorV2与Chainlink VRF的通信，从而实现需求
    //功能是需要部分重新实现的，所以我们继承了VRFConsumerBaseV2，然后重写了部分代码逻辑，以实现新合约的业务逻辑，同时我们继承了VRFConsumerBaseV2的基础逻辑（Chainlink VRF进行交互的逻辑）

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint16) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}

//Library（库）:
// 库在Solidity中是一组函数的集合，这些函数被设计为可以被其他合约重用，而不需要继承或创建库的实例。
// 库通常包含静态函数，这意味着它们不会修改库自身的状态（因为库不能持有状态），但可以被用来操作调用它们的合约的状态。
// 库函数可以通过使用库的名称直接调用，就像调用静态函数一样。

// Abstract Contract（抽象合约）:
// 抽象合约是定义了一些函数但没有为所有函数提供实现的合约。这意味着抽象合约不能直接部署，因为它不完整。
// 抽象合约中可以包含已经实现的函数（具体逻辑）和没有实现的函数（仅有声明）。
// 任何继承抽象合约的子合约都需要实现所有未实现的函数，才能成为一个非抽象合约，这样才能部署。

// Interface（接口）:
// 接口仅定义函数的原型，不包含任何函数的实现。接口可以看作是一个合约应该遵守的规范或模板。
// 接口定义了可以调用的函数，但它是如何实现的则完全取决于实现该接口的合约。
// 任何实现接口的合约都必须实现接口中声明的所有函数。

//接口定义了函数的名称、参数和返回类型，但不包括函数体内的代码。这意味着如果一个合约声明它实现了某个接口，那么这个合约必须提供所有在接口中声明的函数的具体实现代码。

// 重写一个函数时，你只会修改该函数的实现（函数体），而函数的签名将保持不变。
