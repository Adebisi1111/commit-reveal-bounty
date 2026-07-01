# Architecture Note: Commit-Reveal Bounty System

## Overview

This document explains the architecture of the Privacy-Preserving Bounty System built for the Ritual Academy assignment.

## Design Decisions

### 1. Why Commit-Reveal?

**Problem:** Public submissions allow copying and unfair advantages.

**Solution:** Two-phase commit-reveal pattern:
- **Commit Phase:** Submit hash only (answer hidden)
- **Reveal Phase:** Submit answer + salt (verified against hash)

**Benefits:**
- ✅ Submissions hidden until reveal
- ✅ Cannot change answer after committing
- ✅ Proves you knew the answer at commit time
- ✅ Prevents front-running and copying

### 2. On-Chain vs Off-Chain

| Component | Location | Reason |
|-----------|----------|--------|
| Commitment hashes | On-chain | Proves submission exists |
| Submission deadlines | On-chain | Enforced by contract |
| Reveal deadlines | On-chain | Enforced by contract |
| Actual answers | On-chain (after reveal) | Needed for verification |
| AI judging | Off-chain | LLM runs off-chain |
| Winner selection | On-chain | Final record |

### 3. Hash Construction

```solidity
keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
```

**Why each component?**
- `answer` — The actual submission
- `salt` — Secret to prevent rainbow table attacks
- `msg.sender` — Prevents someone else from revealing your answer
- `bountyId` — Prevents reusing commitments across bounties

### 4. Phase Enforcement

The contract enforces strict phase transitions:

```
Submission Phase → Reveal Phase → Judging Phase
      ↓                ↓              ↓
   Can submit      Can reveal    Can finalize
   Can't reveal    Can't submit  Can't reveal
```

This prevents:
- Submitting after seeing reveals
- Revealing after seeing others' reveals
- Finalizing before all reveals are in

## Security Considerations

### What's Protected
- ✅ Answers hidden during submission phase
- ✅ Cannot change commitment after submitting
- ✅ Cannot reveal someone else's answer
- ✅ Cannot finalize before reveal phase ends

### What's Not Protected
- ⚠️ Answers are public after reveal (by design)
- ⚠️ Owner can see all commitments (but can't change them)
- ⚠️ Timing attacks possible if deadlines are too short

### Mitigations
- Use reasonable deadline durations
- Owner is trusted (centralized component)
- Consider adding minimum submission count

## Integration with Ritual

### For Advanced Track (Ritual-Native)

To integrate with Ritual's TEE:

1. **Encrypted Submissions:**
   - Encrypt answers with Ritual's public key
   - Store encrypted answers on-chain
   - Only TEE can decrypt for judging

2. **Batch Judging:**
   - Collect all encrypted submissions
   - Send to TEE in single batch
   - TEE decrypts, judges, returns winner

3. **Privacy Guarantees:**
   - Answers never visible on-chain
   - Only TEE sees plaintext
   - Results published after judging

## Gas Optimization

### Current Design
- Uses mappings for O(1) lookups
- Stores only necessary data
- Events for off-chain indexing

### Potential Improvements
- Merkle tree for large submission counts
- Off-chain storage with on-chain hash
- Batch operations for multiple bounties

## Future Enhancements

1. **Multiple Winners:** Support top-N winners
2. **Prize Distribution:** Automatic prize transfers
3. **Dispute Resolution:** Challenge mechanism
4. **Reputation System:** Track participant history
5. **AI Integration:** On-chain AI judging via Ritual precompiles

## Conclusion

This architecture provides a solid foundation for privacy-preserving bounty systems. The commit-reveal pattern ensures fair competition while maintaining verifiability. Integration with Ritual's TEE would add additional privacy guarantees for the advanced track.
