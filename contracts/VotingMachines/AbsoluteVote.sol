pragma solidity ^0.4.11;

import "../controller/Reputation.sol";
import "./IntVoteInterface.sol";

contract AbsoluteVote is IntVoteInterface{
  using SafeMath for uint;


  struct Parameters {
    Reputation reputationSystem; // the reputation system that is being used
    uint numOfChoices;
    uint precReq; // how many precentages are required for the porpsal to be passed
    bool allowOwner; // does this porposal has a owner who has owner rights?
  }

  struct Voter {
    uint vote; // 0 - 'abstain'
    uint reputation; // amount of voter's reputation
  }

  struct Proposal {
    address owner; // the porposal's owner
    address avatar; // the avatar of the organization that owns the porposal
    ExecutableInterface executable; // will be executed if the perposal will pass
    bytes32 paramsHash; // the hash of the parameters of the porposal
    uint totalVotes;
    mapping(uint=>uint) votes;
    mapping(address=>Voter) voters;
    bool opened; // voting opened flag
  }

  event LogNewProposal(bytes32 indexed _proposalId, address _proposer, bytes32 _paramsHash);
  event LogCancelProposal(bytes32 indexed _proposalId);
  event LogExecuteProposal(bytes32 indexed _proposalId, uint _decision);
  event LogVoteProposal(bytes32 indexed _proposalId, address indexed _voter, uint _vote, uint _reputation, bool _isOwnerVote);
  event LogCancelVoting(bytes32 indexed _proposalId, address indexed _voter);

  mapping(bytes32=>Parameters) public parameters;  // A mapping from hashes to parameters
  mapping(bytes32=>Proposal) public proposals; // Mapping from the ID of the proposal to the proposal itself.

  uint constant public maxNumOfChoices = 10;
  uint proposalsCnt; // Total amount of porposals

  /**
   * @dev Check that there is owner for the porposal and he sent the transaction
   */
  modifier onlyProposalOwner(bytes32 _proposalId) {
    require(msg.sender == proposals[_proposalId].owner);
    _;
  }

  /**
   * @dev Check that the porposal is votable (opened and not executed yet)
   */
  modifier votableProposal(bytes32 _proposalId) {
    require(proposals[_proposalId].opened);
    _;
  }

  function AbsoluteVote() {
  }

  /**
   * @dev hash the parameters, save them if necessary, and return the hash value
   */
  function setParameters(Reputation _reputationSystem, uint _numOfChoices, uint _precReq, bool _allowOwner) returns(bytes32) {
    require(_precReq <= 100 && _precReq > 0);
    require(_numOfChoices > 0 && _numOfChoices <= maxNumOfChoices);
    bytes32 hashedParameters = getParametersHash(_reputationSystem, _numOfChoices, _precReq, _allowOwner);
    parameters[hashedParameters] = Parameters({
      reputationSystem: _reputationSystem,
      numOfChoices: _numOfChoices,
      precReq: _precReq,
      allowOwner: _allowOwner
    });
    return hashedParameters;
  }

  /**
   * @dev hashParameters returns a hash of the given parameters
   */
  function getParametersHash(Reputation _reputationSystem, uint _numOfOptions, uint _precReq, bool _allowOwner) constant returns(bytes32) {
      return sha3(_reputationSystem, _numOfOptions, _precReq, _allowOwner);
  }

  /**
   * @dev register a new proposal with the given parameters. Every porposal has a unique ID which is being
   * generated by calculating sha3 of a incremented counter.
   * @param _paramsHash defined the parameters of the voting machine used for this proposal
   * @param _avatar an address to be sent as the payload to the _executable contract.
   * @param _executable This contract will be executed when vote is over.
   * TODO: Maybe we neem to check the the 0 < precReq <= 100 ??
   */
  function propose(bytes32 _paramsHash, address _avatar, ExecutableInterface _executable) returns(bytes32) {
    // Check valid params:
    require(parameters[_paramsHash].numOfChoices > 0);

    // Generate a unique ID:
    bytes32 proposalId = sha3(this, proposalsCnt);
    proposalsCnt++;

    // Open proposal:
    Proposal memory proposal;
    proposal.paramsHash = _paramsHash;
    proposal.avatar = _avatar;
    proposal.executable = _executable;
    proposal.owner = msg.sender;
    proposal.opened = true;
    proposals[proposalId] = proposal;
    LogNewProposal(proposalId, msg.sender, _paramsHash);
    return proposalId;
  }

  /**
   * @dev Cancel a porposal, only the owner can call this function and only if allowOwner flag is true.
   * @param _proposalId the porposal ID
   */
  function cancelProposal(bytes32 _proposalId) onlyProposalOwner(_proposalId) votableProposal(_proposalId) returns(bool){
    if (! parameters[proposals[_proposalId].paramsHash].allowOwner) {
      return false;
    }
    delete proposals[_proposalId];
    LogCancelProposal(_proposalId);
    return true;
  }

  /**
   * @dev Vote for a proposal, if the voter already voted, cancel the last vote and set a new one instead
   * @param _proposalId id of the proposal
   * @param _voter used in case the vote is cast for someone else
   * @param _vote yes (1) / no (-1) / abstain (0)
   * @return true in case of success
   * throws if proposal is not opened or if it is executed
   * NB: executes the proposal if a decision has been reached
   */
  function internalVote(bytes32 _proposalId, address _voter, uint _vote, uint _rep) internal votableProposal(_proposalId) {
    Proposal storage proposal = proposals[_proposalId];
    Parameters memory params = parameters[proposal.paramsHash];

    // Check valid vote:
    require(_vote <= params.numOfChoices);

    // Check voter has enough reputation:
    uint reputation = params.reputationSystem.reputationOf(_voter);
    require(reputation >= _rep);
    if (_rep == 0) {
      _rep = reputation;
    }

    // If this voter has already voted, first cancel the vote:
    if (proposal.voters[_voter].reputation != 0) {
        cancelVoteInternal(_proposalId, _voter);
    }

    // The voting itself:
    proposal.votes[_vote] = _rep.add(proposal.votes[_vote]);
    proposal.totalVotes = _rep.add(proposal.totalVotes);
    proposal.voters[_voter] = Voter({
      reputation: _rep,
      vote: _vote
    });

    // Check if ownerVote:
    bool isOwnerVote;
    if (_voter != msg.sender) {
      isOwnerVote = true;
    }

    // Event:
    LogVoteProposal(_proposalId, _voter, _vote, reputation, isOwnerVote);

    // execute the proposal if this vote was decisive:
    executeProposal(_proposalId);
  }

  /**
   * @dev voting function
   * @param _proposalId id of the proposal
   * @param _vote yes (1) / no (-1) / abstain (0)
   */
  function vote(bytes32 _proposalId, uint _vote) {
    internalVote(_proposalId, msg.sender, _vote, 0);
  }

  /**
   * @dev voting function with owner functionality (can vote on behalf of someone else)
   * @param _proposalId id of the proposal
   * @param _vote yes (1) / no (-1) / abstain (0)
   * @param _voter will be voted with that voter's address
   */
  function ownerVote(bytes32 _proposalId, uint _vote, address _voter) onlyProposalOwner(_proposalId) returns(bool) {
    if (! parameters[proposals[_proposalId].paramsHash].allowOwner) {
      return false;
    }
    internalVote(_proposalId, _voter, _vote, 0);
    return true;
  }

  function voteWithSpecifiedAmounts(bytes32 _proposalId, uint _vote, uint _rep, uint) votableProposal(_proposalId) {
    internalVote(_proposalId, msg.sender, _vote, _rep);
  }

  function cancelVoteInternal(bytes32 _proposalId, address _voter) internal {
    Proposal storage proposal = proposals[_proposalId];
    Voter memory voter = proposal.voters[_voter];

    proposal.votes[voter.vote] = (proposal.votes[voter.vote]).sub(voter.reputation);
    proposal.totalVotes = (proposal.totalVotes).sub(voter.reputation);

    delete proposal.voters[_voter];
    LogCancelVoting(_proposalId, _voter);
  }

  /**
   * @dev Cancel the vote of the msg.sender: subtract the reputation amount from the votes
   * and delete the voter from the porposal struct
   * @param _proposalId id of the proposal
   */
  function cancelVote(bytes32 _proposalId) votableProposal(_proposalId) {
    cancelVoteInternal(_proposalId, msg.sender);
  }

  /**
   * @dev check if the proposal has been decided, and if so, execute the proposal
   * @param _proposalId the id of the proposal
   * @return bool is the porposal has been executed or not?
   */
  // TODO: do we want to delete the vote from the proposals mapping?
  function executeProposal(bytes32 _proposalId) votableProposal(_proposalId) returns(bool) {
    Proposal storage proposal = proposals[_proposalId];

    uint totalReputation = parameters[proposal.paramsHash].reputationSystem.totalSupply();
    uint precReq = parameters[proposal.paramsHash].precReq;

    // Check if someone crossed the bar:
    for (uint cnt=0; cnt<=parameters[proposal.paramsHash].numOfChoices; cnt++) {
      if (proposal.votes[cnt] > totalReputation*precReq/100) {
        Proposal memory tmpProposal = proposal;
        delete proposals[_proposalId];
        LogExecuteProposal(_proposalId, cnt);
        (tmpProposal.executable).execute(_proposalId, tmpProposal.avatar, int(cnt));
        return true;
      }
    }
    return false;
  }

  /**
   * @dev voteInfo returns the vote and the amount of reputation of the user committed to this proposal
   * @param _proposalId the ID of the proposal
   * @param _voter the address of the voter
   * @return int[10] array that contains the vote's info:
   * amount of reputation committed by _voter to _proposalId, and the voters vote (1/-1/-0)
   */
  function voteInfo(bytes32 _proposalId, address _voter) constant returns(uint[13]) {
    Voter memory voter = proposals[_proposalId].voters[_voter];
    return [voter.vote, voter.reputation, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  /**
   * @dev proposalStatus returns the number of yes, no, and abstain and if the porposal is ended of a given porposal id
   * @param _proposalId the ID of the proposal
   * @return int[10] array that contains the porposal's info:
   * number of yes, no, and abstain, and if the voting for the porposal has ended
   */
  function proposalStatus(bytes32 _proposalId) constant returns(uint[13]) {
    Proposal storage proposal = proposals[_proposalId];
    uint opened = proposal.opened ? 1 : 0;
    uint[13] memory returnedArray;
    returnedArray[12] = opened;
    for (uint cnt=0; cnt<=parameters[proposal.paramsHash].numOfChoices; cnt++) {
      returnedArray[cnt] = proposal.votes[cnt];
    }
    return returnedArray;
  }
}
