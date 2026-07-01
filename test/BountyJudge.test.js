const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CommitRevealBounty", function () {
  let bountyContract;
  let owner;
  let submitter1;
  let submitter2;
  let nonOwner;

  // Test constants
  const BOUNTY_TITLE = "Test Bounty";
  const BOUNTY_DESC = "Test Description";
  const SUBMISSION_DURATION = 3600; // 1 hour
  const REVEAL_DURATION = 3600; // 1 hour
  const ANSWER_1 = "Hello World";
  const SALT_1 = ethers.utils.formatBytes32String("mySalt1");
  const ANSWER_2 = "Goodbye World";
  const SALT_2 = ethers.utils.formatBytes32String("mySalt2");

  beforeEach(async function () {
    [owner, submitter1, submitter2, nonOwner] = await ethers.getSigners();
    
    const BountyContract = await ethers.getContractFactory("CommitRevealBounty");
    bountyContract = await BountyContract.deploy();
    await bountyContract.deployed();
  });

  describe("Bounty Creation", function () {
    it("Should create a bounty correctly", async function () {
      const tx = await bountyContract.createBounty(
        BOUNTY_TITLE,
        BOUNTY_DESC,
        SUBMISSION_DURATION,
        REVEAL_DURATION
      );
      
      const receipt = await tx.wait();
      const event = receipt.events.find(e => e.event === "BountyCreated");
      const bountyId = event.args.bountyId;
      
      const bounty = await bountyContract.getBounty(bountyId);
      expect(bounty.id).to.equal(bountyId);
      expect(bounty.title).to.equal(BOUNTY_TITLE);
      expect(bounty.totalSubmissions).to.equal(0);
      expect(bounty.totalRevealed).to.equal(0);
      expect(bounty.finalized).to.be.false;
    });

    it("Should reject invalid durations", async function () {
      await expect(
        bountyContract.createBounty(BOUNTY_TITLE, BOUNTY_DESC, 0, REVEAL_DURATION)
      ).to.be.revertedWith("Invalid submission duration");

      await expect(
        bountyContract.createBounty(BOUNTY_TITLE, BOUNTY_DESC, SUBMISSION_DURATION, 0)
      ).to.be.revertedWith("Invalid reveal duration");
    });

    it("Should only allow owner to create bounties", async function () {
      await expect(
        bountyContract.connect(nonOwner).createBounty(
          BOUNTY_TITLE,
          BOUNTY_DESC,
          SUBMISSION_DURATION,
          REVEAL_DURATION
        )
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("Commitment Submission", function () {
    let bountyId;

    beforeEach(async function () {
      const tx = await bountyContract.createBounty(
        BOUNTY_TITLE,
        BOUNTY_DESC,
        SUBMISSION_DURATION,
        REVEAL_DURATION
      );
      const receipt = await tx.wait();
      bountyId = receipt.events.find(e => e.event === "BountyCreated").args.bountyId;
    });

    it("Should submit commitment correctly", async function () {
      const commitment = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["string", "bytes32", "address", "uint256"],
          [ANSWER_1, SALT_1, submitter1.address, bountyId]
        )
      );

      await expect(
        bountyContract.connect(submitter1).submitCommitment(bountyId, commitment)
      )
        .to.emit(bountyContract, "CommitmentSubmitted")
        .withArgs(bountyId, submitter1.address, commitment);

      expect(await bountyContract.hasSubmitted(bountyId, submitter1.address)).to.be.true;
    });

    it("Should reject empty commitment", async function () {
      await expect(
        bountyContract.connect(submitter1).submitCommitment(bountyId, ethers.constants.HashZero)
      ).to.be.revertedWith("Invalid commitment");
    });

    it("Should reject double submission", async function () {
      const commitment = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["string", "bytes32", "address", "uint256"],
          [ANSWER_1, SALT_1, submitter1.address, bountyId]
        )
      );

      await bountyContract.connect(submitter1).submitCommitment(bountyId, commitment);
      
      await expect(
        bountyContract.connect(submitter1).submitCommitment(bountyId, commitment)
      ).to.be.revertedWith("Already submitted");
    });
  });

  describe("Answer Reveal", function () {
    let bountyId;
    let commitment1;
    let commitment2;

    beforeEach(async function () {
      const tx = await bountyContract.createBounty(
        BOUNTY_TITLE,
        BOUNTY_DESC,
        SUBMISSION_DURATION,
        REVEAL_DURATION
      );
      const receipt = await tx.wait();
      bountyId = receipt.events.find(e => e.event === "BountyCreated").args.bountyId;

      // Create commitments
      commitment1 = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["string", "bytes32", "address", "uint256"],
          [ANSWER_1, SALT_1, submitter1.address, bountyId]
        )
      );
      commitment2 = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["string", "bytes32", "address", "uint256"],
          [ANSWER_2, SALT_2, submitter2.address, bountyId]
        )
      );

      // Submit commitments
      await bountyContract.connect(submitter1).submitCommitment(bountyId, commitment1);
      await bountyContract.connect(submitter2).submitCommitment(bountyId, commitment2);

      // Fast forward to reveal phase
      await ethers.provider.send("evm_increaseTime", [SUBMISSION_DURATION + 1]);
      await ethers.provider.send("evm_mine");
    });

    it("Should reveal answer correctly", async function () {
      await expect(
        bountyContract.connect(submitter1).revealAnswer(bountyId, ANSWER_1, SALT_1)
      )
        .to.emit(bountyContract, "AnswerRevealed")
        .withArgs(bountyId, submitter1.address, ANSWER_1);

      expect(await bountyContract.hasRevealed(bountyId, submitter1.address)).to.be.true;
    });

    it("Should reject wrong answer", async function () {
      await expect(
        bountyContract.connect(submitter1).revealAnswer(bountyId, "Wrong Answer", SALT_1)
      ).to.be.revertedWith("Invalid reveal");
    });

    it("Should reject wrong salt", async function () {
      const wrongSalt = ethers.utils.formatBytes32String("wrongSalt");
      await expect(
        bountyContract.connect(submitter1).revealAnswer(bountyId, ANSWER_1, wrongSalt)
      ).to.be.revertedWith("Invalid reveal");
    });

    it("Should get revealed answers correctly", async function () {
      await bountyContract.connect(submitter1).revealAnswer(bountyId, ANSWER_1, SALT_1);
      await bountyContract.connect(submitter2).revealAnswer(bountyId, ANSWER_2, SALT_2);

      const [submitters, answers] = await bountyContract.getRevealedAnswers(bountyId);
      expect(submitters.length).to.equal(2);
      expect(answers[0]).to.equal(ANSWER_1);
      expect(answers[1]).to.equal(ANSWER_2);
    });
  });

  describe("Winner Finalization", function () {
    let bountyId;

    beforeEach(async function () {
      const tx = await bountyContract.createBounty(
        BOUNTY_TITLE,
        BOUNTY_DESC,
        SUBMISSION_DURATION,
        REVEAL_DURATION
      );
      const receipt = await tx.wait();
      bountyId = receipt.events.find(e => e.event === "BountyCreated").args.bountyId;

      // Submit and reveal
      const commitment = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["string", "bytes32", "address", "uint256"],
          [ANSWER_1, SALT_1, submitter1.address, bountyId]
        )
      );
      await bountyContract.connect(submitter1).submitCommitment(bountyId, commitment);

      // Fast forward to reveal phase
      await ethers.provider.send("evm_increaseTime", [SUBMISSION_DURATION + 1]);
      await ethers.provider.send("evm_mine");

      await bountyContract.connect(submitter1).revealAnswer(bountyId, ANSWER_1, SALT_1);

      // Fast forward past reveal phase
      await ethers.provider.send("evm_increaseTime", [REVEAL_DURATION + 1]);
      await ethers.provider.send("evm_mine");
    });

    it("Should finalize winner correctly", async function () {
      await expect(
        bountyContract.finalizeWinner(bountyId, submitter1.address)
      )
        .to.emit(bountyContract, "WinnerFinalized")
        .withArgs(bountyId, submitter1.address);

      const bounty = await bountyContract.getBounty(bountyId);
      expect(bounty.finalized).to.be.true;
      expect(bounty.winner).to.equal(submitter1.address);
    });

    it("Should reject non-owner finalization", async function () {
      await expect(
        bountyContract.connect(nonOwner).finalizeWinner(bountyId, submitter1.address)
      ).to.be.revertedWith("Not owner");
    });

    it("Should reject non-revealer as winner", async function () {
      await expect(
        bountyContract.finalizeWinner(bountyId, submitter2.address)
      ).to.be.revertedWith("Winner didn't reveal");
    });

    it("Should reject double finalization", async function () {
      await bountyContract.finalizeWinner(bountyId, submitter1.address);
      
      await expect(
        bountyContract.finalizeWinner(bountyId, submitter1.address)
      ).to.be.revertedWith("Already finalized");
    });
  });

  describe("Phase Detection", function () {
    it("Should detect correct phases", async function () {
      const tx = await bountyContract.createBounty(
        BOUNTY_TITLE,
        BOUNTY_DESC,
        SUBMISSION_DURATION,
        REVEAL_DURATION
      );
      const receipt = await tx.wait();
      const bountyId = receipt.events.find(e => e.event === "BountyCreated").args.bountyId;

      // Should be in submission phase
      expect(await bountyContract.getCurrentPhase(bountyId)).to.equal(1);

      // Fast forward to reveal phase
      await ethers.provider.send("evm_increaseTime", [SUBMISSION_DURATION + 1]);
      await ethers.provider.send("evm_mine");
      expect(await bountyContract.getCurrentPhase(bountyId)).to.equal(2);

      // Fast forward to judging phase
      await ethers.provider.send("evm_increaseTime", [REVEAL_DURATION + 1]);
      await ethers.provider.send("evm_mine");
      expect(await bountyContract.getCurrentPhase(bountyId)).to.equal(3);
    });
  });
});

  describe("AI Judging (judgeAll)", function () {
    let bountyId;
    let commitment1;
    let commitment2;

    beforeEach(async function () {
      const tx = await bountyContract.createBounty(
        BOUNTY_TITLE,
        BOUNTY_DESC,
        SUBMISSION_DURATION,
        REVEAL_DURATION
      );
      const receipt = await tx.wait();
      bountyId = receipt.events.find(e => e.event === "BountyCreated").args.bountyId;

      // Create commitments
      commitment1 = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["string", "bytes32", "address", "uint256"],
          [ANSWER_1, SALT_1, submitter1.address, bountyId]
        )
      );
      commitment2 = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["string", "bytes32", "address", "uint256"],
          [ANSWER_2, SALT_2, submitter2.address, bountyId]
        )
      );

      // Submit commitments
      await bountyContract.connect(submitter1).submitCommitment(bountyId, commitment1);
      await bountyContract.connect(submitter2).submitCommitment(bountyId, commitment2);

      // Fast forward to reveal phase
      await ethers.provider.send("evm_increaseTime", [SUBMISSION_DURATION + 1]);
      await ethers.provider.send("evm_mine");

      // Reveal answers
      await bountyContract.connect(submitter1).revealAnswer(bountyId, ANSWER_1, SALT_1);
      await bountyContract.connect(submitter2).revealAnswer(bountyId, ANSWER_2, SALT_2);

      // Fast forward past reveal phase
      await ethers.provider.send("evm_increaseTime", [REVEAL_DURATION + 1]);
      await ethers.provider.send("evm_mine");
    });

    it("Should store AI judgment result", async function () {
      const llmInput = ethers.utils.toUtf8Bytes(JSON.stringify({
        winnerIndex: 0,
        ranking: [{ index: 0, score: 94, reason: "Best answer" }]
      }));

      await expect(
        bountyContract.judgeAll(bountyId, llmInput)
      )
        .to.emit(bountyContract, "Judged")
        .withArgs(bountyId, llmInput);

      const bounty = await bountyContract.getBounty(bountyId);
      expect(bounty.judged).to.be.true;
    });

    it("Should reject judging before reveal phase ends", async function () {
      // Create new bounty and try to judge immediately
      const tx = await bountyContract.createBounty(
        BOUNTY_TITLE,
        BOUNTY_DESC,
        SUBMISSION_DURATION,
        REVEAL_DURATION
      );
      const receipt = await tx.wait();
      const newBountyId = receipt.events.find(e => e.event === "BountyCreated").args.bountyId;

      const llmInput = ethers.utils.toUtf8Bytes("{}");
      await expect(
        bountyContract.judgeAll(newBountyId, llmInput)
      ).to.be.revertedWith("Reveal phase not ended");
    });

    it("Should reject double judging", async function () {
      const llmInput = ethers.utils.toUtf8Bytes("{}");
      await bountyContract.judgeAll(bountyId, llmInput);
      
      await expect(
        bountyContract.judgeAll(bountyId, llmInput)
      ).to.be.revertedWith("Already judged");
    });

    it("Should reject non-owner judging", async function () {
      const llmInput = ethers.utils.toUtf8Bytes("{}");
      await expect(
        bountyContract.connect(nonOwner).judgeAll(bountyId, llmInput)
      ).to.be.revertedWith("Not owner");
    });

    it("Should finalize winner by index after judging", async function () {
      const llmInput = ethers.utils.toUtf8Bytes(JSON.stringify({
        winnerIndex: 0,
        ranking: [{ index: 0, score: 94, reason: "Best answer" }]
      }));
      await bountyContract.judgeAll(bountyId, llmInput);

      await expect(
        bountyContract.finalizeWinner(bountyId, 0)
      )
        .to.emit(bountyContract, "WinnerFinalized")
        .withArgs(bountyId, 0, submitter1.address);

      const bounty = await bountyContract.getBounty(bountyId);
      expect(bounty.finalized).to.be.true;
      expect(bounty.winnerIndex).to.equal(0);
    });

    it("Should reject finalization before judging", async function () {
      await expect(
        bountyContract.finalizeWinner(bountyId, 0)
      ).to.be.revertedWith("Not judged yet");
    });

    it("Should get winner address", async function () {
      const llmInput = ethers.utils.toUtf8Bytes("{}");
      await bountyContract.judgeAll(bountyId, llmInput);
      await bountyContract.finalizeWinner(bountyId, 1);

      const winner = await bountyContract.getWinner(bountyId);
      expect(winner).to.equal(submitter2.address);
    });

    it("Should get judge result", async function () {
      const llmInput = ethers.utils.toUtf8Bytes(JSON.stringify({ winnerIndex: 0 }));
      await bountyContract.judgeAll(bountyId, llmInput);

      const result = await bountyContract.getJudgeResult(bountyId);
      expect(result).to.equal(llmInput);
    });
  });
});
