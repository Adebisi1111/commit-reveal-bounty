// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CommitRevealBounty
 * @notice Privacy-preserving bounty system with commit-reveal scheme
 * @dev Submissions are hidden until reveal phase to prevent copying
 */
contract CommitRevealBounty {
    // ─── State Variables ─────────────────────────────────────────────
    
    address public owner;
    uint256 public bountyCounter;
    
    // Bounty struct
    struct Bounty {
        uint256 id;
        string title;
        string description;
        uint256 submissionDeadline;
        uint256 revealDeadline;
        uint256 prizeAmount;
        bool judged;
        bool finalized;
        uint256 winnerIndex;
        uint256 totalSubmissions;
        uint256 totalRevealed;
    }
    
    // Commitment struct
    struct Commitment {
        bytes32 hash;
        bool revealed;
        bool exists;
        string revealedAnswer;
    }
    
    // ─── Mappings ────────────────────────────────────────────────────
    
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => mapping(address => Commitment)) public commitments;
    mapping(uint256 => address[]) public revealedSubmitters;
    mapping(uint256 => bytes) public judgeResults; // Store AI judge results
    
    // ─── Events ──────────────────────────────────────────────────────
    
    event BountyCreated(uint256 indexed bountyId, string title, uint256 submissionDeadline, uint256 revealDeadline);
    event CommitmentSubmitted(uint256 indexed bountyId, address indexed submitter, bytes32 commitment);
    event AnswerRevealed(uint256 indexed bountyId, address indexed submitter, string answer);
    event Judged(uint256 indexed bountyId, bytes result);
    event WinnerFinalized(uint256 indexed bountyId, uint256 indexed winnerIndex, address winner);
    
    // ─── Modifiers ───────────────────────────────────────────────────
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier bountyExists(uint256 bountyId) {
        require(bounties[bountyId].id != 0, "Bounty does not exist");
        _;
    }
    
    // ─── Constructor ─────────────────────────────────────────────────
    
    constructor() {
        owner = msg.sender;
    }
    
    // ─── Core Functions ──────────────────────────────────────────────
    
    /**
     * @notice Create a new bounty
     * @param title Bounty title
     * @param description Bounty description
     * @param submissionDuration Time allowed for submissions (in seconds)
     * @param revealDuration Time allowed for reveals (in seconds)
     */
    function createBounty(
        string calldata title,
        string calldata description,
        uint256 submissionDuration,
        uint256 revealDuration
    ) external onlyOwner returns (uint256) {
        require(submissionDuration > 0, "Invalid submission duration");
        require(revealDuration > 0, "Invalid reveal duration");
        
        bountyCounter++;
        uint256 newBountyId = bountyCounter;
        
        uint256 submissionDeadline = block.timestamp + submissionDuration;
        uint256 revealDeadline = submissionDeadline + revealDuration;
        
        bounties[newBountyId] = Bounty({
            id: newBountyId,
            title: title,
            description: description,
            submissionDeadline: submissionDeadline,
            revealDeadline: revealDeadline,
            prizeAmount: 0,
            judged: false,
            finalized: false,
            winnerIndex: 0,
            totalSubmissions: 0,
            totalRevealed: 0
        });
        
        emit BountyCreated(newBountyId, title, submissionDeadline, revealDeadline);
        return newBountyId;
    }
    
    /**
     * @notice Submit a commitment hash during submission phase
     * @param bountyId The bounty to submit to
     * @param commitment keccak256(answer, salt, msg.sender, bountyId)
     */
    function submitCommitment(uint256 bountyId, bytes32 commitment) 
        external 
        bountyExists(bountyId) 
    {
        Bounty storage bounty = bounties[bountyId];
        require(block.timestamp <= bounty.submissionDeadline, "Submission phase ended");
        require(!commitments[bountyId][msg.sender].exists, "Already submitted");
        require(commitment != bytes32(0), "Invalid commitment");
        
        commitments[bountyId][msg.sender] = Commitment({
            hash: commitment,
            revealed: false,
            exists: true,
            revealedAnswer: ""
        });
        
        bounty.totalSubmissions++;
        
        emit CommitmentSubmitted(bountyId, msg.sender, commitment);
    }
    
    /**
     * @notice Reveal answer during reveal phase
     * @param bountyId The bounty to reveal for
     * @param answer The original answer
     * @param salt The secret salt used in commitment
     */
    function revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)
        external
        bountyExists(bountyId)
    {
        Bounty storage bounty = bounties[bountyId];
        require(block.timestamp > bounty.submissionDeadline, "Still in submission phase");
        require(block.timestamp <= bounty.revealDeadline, "Reveal phase ended");
        require(commitments[bountyId][msg.sender].exists, "No commitment found");
        require(!commitments[bountyId][msg.sender].revealed, "Already revealed");
        
        // Verify the commitment hash
        bytes32 computedHash = keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId));
        require(computedHash == commitments[bountyId][msg.sender].hash, "Invalid reveal");
        
        commitments[bountyId][msg.sender].revealed = true;
        commitments[bountyId][msg.sender].revealedAnswer = answer;
        
        revealedSubmitters[bountyId].push(msg.sender);
        bounty.totalRevealed++;
        
        emit AnswerRevealed(bountyId, msg.sender, answer);
    }
    
    /**
     * @notice Get all revealed answers for AI judging (called off-chain)
     * @param bountyId The bounty to get answers for
     * @return submitters Array of addresses that revealed
     * @return answers Array of revealed answers
     */
    function getRevealedAnswers(uint256 bountyId) 
        external 
        view 
        bountyExists(bountyId) 
        returns (address[] memory submitters, string[] memory answers) 
    {
        uint256 count = revealedSubmitters[bountyId].length;
        submitters = new address[](count);
        answers = new string[](count);
        
        for (uint256 i = 0; i < count; i++) {
            address submitter = revealedSubmitters[bountyId][i];
            submitters[i] = submitter;
            answers[i] = commitments[bountyId][submitter].revealedAnswer;
        }
        
        return (submitters, answers);
    }
    
    /**
     * @notice Submit AI judging results (called by owner after off-chain AI evaluation)
     * @param bountyId The bounty to judge
     * @param llmInput The AI judgment result (JSON with winnerIndex, ranking, etc.)
     */
    function judgeAll(uint256 bountyId, bytes calldata llmInput)
        external
        onlyOwner
        bountyExists(bountyId)
    {
        Bounty storage bounty = bounties[bountyId];
        require(block.timestamp > bounty.revealDeadline, "Reveal phase not ended");
        require(!bounty.judged, "Already judged");
        require(bounty.totalRevealed > 0, "No revealed answers to judge");
        
        bounty.judged = true;
        judgeResults[bountyId] = llmInput;
        
        emit Judged(bountyId, llmInput);
    }
    
    /**
     * @notice Finalize winner after AI judging
     * @param bountyId The bounty to finalize
     * @param winnerIndex The index of the winner in revealedSubmitters array
     */
    function finalizeWinner(uint256 bountyId, uint256 winnerIndex)
        external
        onlyOwner
        bountyExists(bountyId)
    {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.judged, "Not judged yet");
        require(!bounty.finalized, "Already finalized");
        require(winnerIndex < revealedSubmitters[bountyId].length, "Invalid winner index");
        
        address winnerAddress = revealedSubmitters[bountyId][winnerIndex];
        require(commitments[bountyId][winnerAddress].revealed, "Winner didn't reveal");
        
        bounty.finalized = true;
        bounty.winnerIndex = winnerIndex;
        
        emit WinnerFinalized(bountyId, winnerIndex, winnerAddress);
    }
    
    // ─── View Functions ──────────────────────────────────────────────
    
    /**
     * @notice Get bounty details
     * @param bountyId The bounty ID
     */
    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }
    
    /**
     * @notice Check if address has submitted to a bounty
     * @param bountyId The bounty ID
     * @param submitter The address to check
     */
    function hasSubmitted(uint256 bountyId, address submitter) external view returns (bool) {
        return commitments[bountyId][submitter].exists;
    }
    
    /**
     * @notice Check if address has revealed their answer
     * @param bountyId The bounty ID
     * @param submitter The address to check
     */
    function hasRevealed(uint256 bountyId, address submitter) external view returns (bool) {
        return commitments[bountyId][submitter].revealed;
    }
    
    /**
     * @notice Get current phase of a bounty
     * @param bountyId The bounty ID
     * @return phase 0 = not started, 1 = submission, 2 = reveal, 3 = judging
     */
    function getCurrentPhase(uint256 bountyId) external view returns (uint8) {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.id == 0) return 0;
        
        if (block.timestamp <= bounty.submissionDeadline) {
            return 1; // Submission phase
        } else if (block.timestamp <= bounty.revealDeadline) {
            return 2; // Reveal phase
        } else {
            return 3; // Judging phase
        }
    }
    
    /**
     * @notice Get the winner address for a finalized bounty
     * @param bountyId The bounty ID
     * @return winner The winner's address
     */
    function getWinner(uint256 bountyId) external view returns (address winner) {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.finalized, "Not finalized");
        return revealedSubmitters[bountyId][bounty.winnerIndex];
    }
    
    /**
     * @notice Get the AI judgment result for a bounty
     * @param bountyId The bounty ID
     * @return result The judgment result bytes
     */
    function getJudgeResult(uint256 bountyId) external view returns (bytes memory result) {
        return judgeResults[bountyId];
    }
}
