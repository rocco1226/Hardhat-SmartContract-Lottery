const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { ethers, deployments, getNamedAccounts, network } = require("hardhat") //第一种获取方式
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle,
              vrfCoordinatorV2Mock,
              raffleAddress,
              vrfCoordinatorV2MockAddress,
              raffleEntranceFee,
              deployerSigner,
              interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              // const { deployments, getNamedAccounts } = hre 两种获取方式
              const { deployer } = await getNamedAccounts()
              //ethers.getNamedAccounts()是hardhat-deploy插件提供的一个功能，它允许你从hardhat.config.js文件中的namedAccounts配置中获取指定名称的账户地址
              //getContractAt函数需要的是一个ethers.Signer对象，而不仅仅是一个账户地址。因此，如果你从getNamedAccounts()获取了deployer账户的地址，你还需要将这个地址转换为一个签名者对象。
              deployerSigner = await ethers.getSigner(deployer)
              //我在这里的前面错误地添加了const deployerSigner，导致在describe(Raffle)中的var deployerSigner无法使用 导致后面的deployerSigner.address为undefined
              await deployments.fixture(["all"])
              raffleAddress = (await deployments.get("Raffle")).address
              vrfCoordinatorV2MockAddress = (await deployments.get("VRFCoordinatorV2Mock")).address
              raffle = await ethers.getContractAt("Raffle", raffleAddress, deployerSigner)
              //we get the contract by using ethers v6, so raffle.address is deprecated, we use raffle.target
              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  "VRFCoordinatorV2Mock",
                  vrfCoordinatorV2MockAddress,
                  deployerSigner,
              )
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId].interval)
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle({})).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETHEntered",
                  )
              })
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployerSigner.address)
              })
              it("emits an event when a player enters", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter",
                  )
              })
              it("doesn't allow entrance when raffle is calculating", async function () {
                  // 设置checkUpKeep返回true
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  // we pretend to be a chainlink keeper to call performUpkeep
                  await raffle.performUpkeep("0x") //参数传入calldata
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee }),
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen()")
              })
          })
          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") //in ethers v5, it should be raffle.callStatic.checkUpkeep("0x"), now is in ethers v6
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("it can only run if upkeepNeeded is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx) // if tx doesn't work, it will throw an error
              })
              it("it reverts if upkeepNeeded is false", async function () {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UPkeepNotNeeded",
                  )
              })
              it("updates the raffle state, emits an event, and calls the vrfCoordinatior", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.logs[1].args.requestId
                  //logs[1]指这个函数emit的第二个事件，因为在emit RequestedRaffleWinner()之前，我们在函数中调用了vrfCoordinatorV2Mock.requestRandomWords()，在vrfCoordinator.sol中可以看到这个函数也会emit一个事件，因此我们在这个函数中emit了两个事件，我们在这里通过第二个事件获取requestId(实际上第一个事件也可以获取requestId)
                  const raffleState = await raffle.getRaffleState()
                  assert(Number(requestId) > 0)
                  assert(raffleState.toString(), "1")
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("it can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target),
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target),
                  ).to.be.revertedWith("nonexistent request")
              }) //在不获取requestId的情况下，直接调用fulfillRandomWords，测试是否可以调用成功
              it("pick a winner, resets the lottery, and sends money", async function () {
                  const accounts = await ethers.getSigners()
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 //deployerSigner=0
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectRaffle = raffle.connect(accounts[i])
                      await accountConnectRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const winnerBalance = await ethers.provider.getBalance(accounts[1])
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the winner!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              const winnerEndingBalance = await ethers.provider.getBalance(
                                  accounts[1],
                              )
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)
                              console.log(`winner is : ${recentWinner}`)
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  (
                                      winnerBalance +
                                      raffleEntranceFee * BigInt(additionalEntrants + 1)
                                  ).toString(),
                                  //TypeError: Cannot mix BigInt and other types, use explicit conversions
                                  //我们需要先将additonalEntrants + 1转换为BigInt类型，才能和BigInt类型的raffleEntranceFee相乘，和BigInt类型的winnerBalance相加
                                  //toString() be used to mix BigInt and other types
                              ) //最终余额=最初余额+所有玩家的入场费
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      try {
                          const tx = await raffle.performUpkeep("0x") //mock chainlink keeper
                          const txReceipt = await tx.wait(1)
                          await vrfCoordinatorV2Mock.fulfillRandomWords(
                              txReceipt.logs[1].args.requestId,
                              raffle.target,
                          ) //mock chainlink vrfCoordinator
                      } catch (e) {
                          reject(e)
                      }
                  })
              })
          })
      })

//似乎ethers v5中，所有地址都有address，而ethers v6中，ethers.Contract对象的地址为target，ethers.Signer对象的地址为address
//因此在ethers v6中，我们应该使用raffle.target而不是raffle.address
