const helpers = require('./helpers');
import { getValueFromLogs } from '../lib/utils.js';

var SimpleVote = artifacts.require("./SimpleVote.sol");
var Reputation = artifacts.require("./Reputation.sol");
var ExecutableTest = artifacts.require("./ExecutableTest.sol");

contract('SimpleVote', function(accounts) {

    before(function(){
    });

    it("should work", async function() {
      const accounts = web3.eth.accounts;
      const simpleVote = await SimpleVote.new();
      const executable = await ExecutableTest.new();

      // set up a reputaiton system
      const reputation = await Reputation.new();
      await reputation.mint(20, accounts[0]);
      await reputation.mint(10, accounts[1]);
      await reputation.mint(70, accounts[2]);

    // register some parameters
      await simpleVote.setParameters(reputation.address, 50);
      const paramsHash = await simpleVote.getParametersHash(reputation.address, 50);

      // propose a vote
      // TODO: have some executable contract to test with that raises an event
      let tx = await simpleVote.propose(paramsHash, helpers.NULL_ADDRESS, executable.address);
      const proposalId = await getValueFromLogs(tx, '_proposalId');
      assert.isOk(proposalId);

      // no one has voted yet at this point
      let proposalInfo, voteInfo;
      proposalInfo = await simpleVote.proposals(proposalId);
      // proposalInfo has the following structure
      // address owner;
      assert.equal(proposalInfo[0], accounts[0]);
      // address avatar;
      assert.equal(proposalInfo[1], helpers.NULL_ADDRESS);
      // ExecutableInterface executable;
      assert.equal(proposalInfo[2], executable.address);
      // bytes32 paramsHash;
      assert.equal(proposalInfo[3], paramsHash);
      // uint yes; // total 'yes' votes
      assert.equal(proposalInfo[4], 0);
      // uint no; // total 'no' votes
      assert.equal(proposalInfo[5], 0);
      // mapping(address=>int) voted; // save the amount of reputation voted by an agent (positive sign is yes, negatice is no)
      // - the mapping is simply not returned at all in the array
      // bool opened; // voting opened flag
      assert.equal(proposalInfo[6], true);
      // bool ended; // voting had ended flag
      assert.equal(proposalInfo[7], false);

      // now lets vote with a minority reputation
      await simpleVote.vote(proposalId, true, accounts[1]);
      const rep1 = await reputation.reputationOf(accounts[1]);
      voteInfo = await simpleVote.voteInfo(proposalId, accounts[1]);
      assert.equal(voteInfo.toNumber(), rep1.toNumber());

      // the decisive vote is cast now and the proposal will be executed
      tx = await simpleVote.vote(proposalId, true, accounts[2]);
      const rep2 = await reputation.reputationOf(accounts[2]);
      voteInfo = await simpleVote.voteInfo(proposalId, accounts[2]);
      assert.equal(voteInfo.toNumber(), rep2.toNumber());

      // this means that the vote is ended now (and decided)
      proposalInfo = await simpleVote.proposals(proposalId);
      // uint yes; // total 'yes' votes
      assert.equal(proposalInfo[4].toNumber(), rep1.toNumber() + rep2.toNumber());
      // uint no; // total 'no' votes
      assert.equal(proposalInfo[5], 0);
      // bool ended; // voting had ended flag
      assert.equal(proposalInfo[7], true);
    });

    it("the vote function should behave as expected [TO DO]", async function() {
      // test different values for the '_voter' arg: i.e. empty, null address, voter != sender, voter == owner, etc
      // simpleVote.vote(..., voter)
      // await simpleVote.vote(proposalId, true, accounts[1]);
      // await simpleVote.vote(proposalId, true, accounts[1], {from: accounts[1]});
      // await simpleVote.vote(proposalId, true, accounts[2], {from: accounts[1]});
      // await simpleVote.vote(proposalId, true, accounts[2], {from: accounts[0]});
      // test with faslse values for boolean
      // await simpleVote.vote(proposalId, false, accounts[1]);
    });
    it("shoud behave sensibly when voting with an empty reputation system [TODO]", async function() {

      const simpleVote = await SimpleVote.new();
      const reputation = await Reputation.new();
      // register some parameters
      await simpleVote.setParameters(reputation.address, 50);
      const params = await simpleVote.getParametersHash(reputation.address, 50);

      await simpleVote.propose(params, helpers.NULL_ADDRESS, helpers.NULL_ADDRESS);
    });
    it("shoud behave sensibly without an executable [TODO]", async function() {

    });
});
