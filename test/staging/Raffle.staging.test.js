const { developmentChains } = require("../../helper-hardhat-config")
const { ethers, deployments, getNamedAccounts, network } = require("hardhat")
const { assert, expect } = require("chai")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Staging Tests", function () {
          let raffle, raffleAddress, raffleEntranceFee, deployerSigner

          beforeEach(async function () {
              const { deployer } = await getNamedAccounts()
              deployerSigner = await ethers.getSigner(deployer)
              raffleAddress = (await deployments.get("Raffle")).address
              raffle = await ethers.getContractAt("Raffle", raffleAddress, deployerSigner)
              console.log("Get Contract already")
              //we get the contract by using ethers v6, so raffle.address is deprecated, we use raffle.target
              raffleEntranceFee = await raffle.getEntranceFee()
          })
          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF", async function () {
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  await new Promise(async function (resolve, reject) {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance =
                                  await ethers.provider.getBalance(deployerSigner)
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              console.log("Get all the data already")
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(
                                  recentWinner.toString(),
                                  deployerSigner.address.toString(),
                              )
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  (winnerStartingBalance + raffleEntranceFee).toString(),
                              ) //都是BigInt类型，因此可以不加toString()
                              assert(endingTimeStamp > startingTimeStamp) //时间戳变化
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      console.log("wait")
                      console.log("Enter Raffle already")
                      const winnerStartingBalance = await ethers.provider.getBalance(deployerSigner)
                  })
              })
          })
      })
