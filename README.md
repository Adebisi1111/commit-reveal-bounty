# Commit-Reveal Bounty System

A privacy-preserving bounty system built on Solidity that prevents submission copying by implementing a commit-reveal scheme.

## 🎯 Problem

Traditional bounty systems expose submissions publicly, allowing participants to:
- Copy others' ideas
- Submit improved versions
- Gain unfair advantages

## ✅ Solution

This contract implements a **commit-reveal pattern** where:
1. Participants submit only a **commitment hash** (hides the actual answer)
2. After the submission deadline, participants **reveal** their answer + salt
3. The contract **verifies** the reveal matches the commitment
4. Only valid, revealed answers are eligible for AI judging

## 🔄 Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    BOUNTY LIFECYCLE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CREATE          Owner creates bounty with deadlines     │
│       ↓                                                     │
│  2. COMMIT          Participants submit commitment hashes   │
│       ↓             (answer hidden)                         │
│  3. REVEAL          Participants reveal answers + salts     │
│       ↓             (verify against commitments)            │
│  4. JUDGE           AI judges revealed answers              │
│       ↓             (off-chain)                             │
│  5. FINALIZE        Owner sets winner                       │
│       ↓             (on-chain)                              │
│  6. COMPLETE        Bounty finished, winner recorded        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Contract Functions

### Core Functions

| Function | Description | When to Call |
|----------|-------------|--------------|
| `createBounty()` | Create new bounty | Owner only |
| `submitCommitment()` | Submit hidden answer hash | Submission phase |
| `revealAnswer()` | Reveal answer + salt | Reveal phase |
| `getRevealedAnswers()` | Get answers for AI judging | After reveal |
| `finalizeWinner()` | Set winner after judging | Owner only |

### View Functions

| Function | Description |
|----------|-------------|
| `getBounty()` | Get bounty details |
| `hasSubmitted()` | Check if address submitted |
| `hasRevealed()` | Check if address revealed |
| `getCurrentPhase()` | Get current phase (1=submit, 2=reveal, 3=judge) |

## 🔐 Security Features

### Commitment Verification
```solidity
bytes32 computedHash = keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId));
require(computedHash == commitments[bountyId][msg.sender].hash, "Invalid reveal");
```

This ensures:
- ✅ Answer matches commitment
- ✅ Salt is correct
- ✅ Submitter is the original sender
- ✅ Bounty ID is correct

### Phase Enforcement
- Submissions only during submission phase
- Reveals only during reveal phase
- Finalization only after reveal phase ends

## 📊 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      CONTRACT STATE                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  bounties[id] ──────────────────────────────────────────┐   │
│  ├── id                                                  │   │
│  ├── title                                               │   │
│  ├── submissionDeadline                                  │   │
│  ├── revealDeadline                                      │   │
│  ├── totalSubmissions                                    │   │
│  ├── totalRevealed                                       │   │
│  ├── finalized                                           │   │
│  └── winner                                              │   │
│                                                          │   │
│  commitments[bountyId][address] ─────────────────────┐   │   │
│  ├── hash (commitment)                               │   │   │
│  ├── revealed (bool)                                 │   │   │
│  ├── exists (bool)                                   │   │   │
│  └── revealedAnswer (string)                         │   │   │
│                                                      │   │   │
│  revealedSubmitters[bountyId] ───────────────────────┘   │   │
│  └── address[] of revealed participants                  │   │
│                                                          │   │
└──────────────────────────────────────────────────────────────┘
```

## 🧪 Test Plan

### Test Cases for Reveal

| Test | Expected Result |
|------|-----------------|
| Submit during submission phase | ✅ Success |
| Submit after deadline | ❌ Revert |
| Submit twice | ❌ Revert |
| Reveal with correct answer | ✅ Success |
| Reveal with wrong answer | ❌ Revert |
| Reveal with wrong salt | ❌ Revert |
| Reveal during submission phase | ❌ Revert |
| Reveal after reveal deadline | ❌ Revert |
| Finalize before reveal ends | ❌ Revert |
| Finalize with non-revealer | ❌ Revert |

### Edge Cases

| Test | Expected Result |
|------|-----------------|
| Empty commitment | ❌ Revert |
| Zero address winner | ❌ Revert |
| Double finalization | ❌ Revert |
| Reveal after finalization | ❌ Revert |

## 🚀 Deployment

### Prerequisites
- Node.js v16+
- Hardhat or Foundry
- Testnet ETH (for gas)

### Deploy Steps
```bash
# Clone the repo
git clone <your-fork-url>
cd commit-reveal-bounty

# Install dependencies
npm install

# Deploy to Ritual Testnet
npx hardhat run scripts/deploy.js --network ritual
```

## 📝 Reflection Question

> "What should be public, what should stay hidden, and what should be decided by AI versus by a human in a bounty system?"

**Answer:**

In a bounty system, the **bounty details** (title, description, deadlines, prizes) should be public to attract participants and ensure transparency. **Submissions should stay hidden** during the evaluation phase to prevent copying and ensure fair competition — this is achieved through the commit-reveal pattern. The **commitment hashes** are public (proving someone submitted), but the actual answers remain private until the reveal phase. **AI should judge technical accuracy, creativity, and completeness** of submissions, as it can evaluate multiple answers consistently and at scale. However, **humans should make final decisions** on edge cases, handle disputes, and ensure the judging criteria align with the bounty's intent. AI excels at objective evaluation, while humans provide contextual understanding and ethical oversight. This hybrid approach balances efficiency with fairness, ensuring the best submissions win while maintaining trust in the process.

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📞 Support

- Discord: [Ritual Discord](https://discord.gg/ritual)
- Docs: [Ritual Documentation](https://docs.ritualfoundation.org)
