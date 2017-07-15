import { Organization } from '../lib/organization.js';
const helpers = require('./helpers')


const SimpleContributionScheme = artifacts.require('./SimpleContributionScheme.sol');
const SimpleVote = artifacts.require('./SimpleVote.sol');
const MintableToken = artifacts.require('./MintableToken.sol');
const Avatar = artifacts.require('./Avatar.sol');
const Controller = artifacts.require('./Controller.sol');

// TODO: write tests where schemes as for fees

contract('SimpleContribution', function(accounts) {

    it("Propose and accept a contribution (in progress)", async function(){
      let params, paramsHash, tx, proposal;
    	const founders = [accounts[0], accounts[1]];
      const repForFounders = [30, 70];
      const testSettings = await helpers.settingsForTest();
      const org = await helpers.forgeOrganization({founders, repForFounders});
      const avatar = org.avatar;
      const controller = org.controller;
    	const schemeRegistrar = org.schemeregistrar;

    	// check if indeed the registrar is registered as a scheme on  the controller
    	const isSchemeRegistered = await controller.isSchemeRegistered(schemeRegistrar.address);
    	assert.equal(isSchemeRegistered, true);
      console.log('x');

      // TODO: check if the controller is registered (has paid the fee)
      // const isControllerRegistered = await schemeRegistrar.isRegistered(org.avatar.address);
    	// assert.equal(isControllerRegistered, true);

      // TODO: check if the configuration parameters of the controller are known on the registrar


    	// we creaet a SimpleContributionScheme
    	const reputationAddress = await controller.nativeReputation();
    	const tokenAddress = await controller.nativeToken();

    	// const votingMachine = await UniversalSimpleVote.new();
      const votingMachine = org.votingMachine;
    	const votingParams = await votingMachine.getParametersHash(
    		reputationAddress,
    		50, // percentage that counts as a majority
    	)
      // we also register the parameters with the voting machine
    	tx = await votingMachine.setParameters(
    		reputationAddress,
    		50, // percentage that counts as a majority
    	)

      // create a contribution Scheme
    	const contributionScheme = await SimpleContributionScheme.new(
    		tokenAddress,
    		0, // register with 0 fee
    		founders[0],
    	);

      const contributionSchemeParamsHash = await contributionScheme.getParametersHash(
    		0, // fee for the organisation?
    		0, // fee for the token?
    		votingParams,
    		votingMachine.address,
		  );

      // these parameters are not registered yet at this point
      params = await contributionScheme.parameters(contributionSchemeParamsHash);
      assert.equal(params[3], '0x0000000000000000000000000000000000000000');

      // register the parameters are registers in the contribution scheme
      await contributionScheme.setParameters(
        0, // fee for the organisation?
        0, // fee for the token?
        votingParams,
        votingMachine.address,
      )

      params = await contributionScheme.parameters(contributionSchemeParamsHash);
      assert.notEqual(params[3], '0x0000000000000000000000000000000000000000');

    	// and we propose to add the contribution scheme to controller
      const simpleContributionFee = await contributionScheme.fee();
      const simpleContributionFeeToken = await contributionScheme.nativeToken();

      // check if we our organization is registered
      const orgFromSchemeRegistrar = await schemeRegistrar.organizations(avatar.address);
      console.log(orgFromSchemeRegistrar);
      assert.equal(orgFromSchemeRegistrar, true);

    	tx = await schemeRegistrar.proposeScheme(
    		avatar.address,
    		contributionScheme.address,
    		contributionSchemeParamsHash,
    		false, // isRegistering
        simpleContributionFeeToken,
        simpleContributionFee
    		);

      const proposalId = tx.logs[0].args.proposalId;

      // // see if the schemeRegistrar has the correct persmissions
      // let tmp;
      // // print some info about the schemeregistrar
      // console.log('This is what the controller knows of the schemeRegistrar (params and permissions)')
      // tmp = await controller.schemes(schemeRegistrar.address);
      // console.log(tmp);
      //
      // console.log('This is what the votingMachine knows of the current proposal (owner, avatar, executable, ...)')
      // tmp = await votingMachine.proposals(proposalId);
      // console.log(tmp);
      //
      // console.log('this is the avatar')
      // tmp = await Avatar.at(tmp[1]);
      // // console.log(tmp);
      // console.log('This is the adress of the controller (=owner ofhte avatar)');
      // tmp = await tmp.owner();
      // console.log(tmp);
      // console.log('compare the address of the original controller and that of the owner of the avatar of the proposal')
      // console.log(tmp)
      // console.log(controller.address)
      //
      // console.log('This is what the schemeRegistrar knows of the current proposal')
      // tmp = await schemeRegistrar.proposals(proposalId);
      // console.log(tmp);

      // this will vote-and-execute
      tx = await votingMachine.vote(proposalId, true, founders[1], {from: founders[1]});
      // console.log(tx.logs);

      // now our scheme should be registered on the controller
      const schemeFromController = await controller.schemes(contributionScheme.address);
      // console.log('schemeFromController [paramsHash, permissions]');
      // console.log(schemeFromController);
      // we expect to have only the first bit set (it is a registered scheme without nay particular permissions)
      assert.equal(schemeFromController[1], '0x00000001')


      //  Our organization is not registered with the contribution scheme yet at this point
      let orgFromContributionScheme = await contributionScheme.organizations(avatar.address);
      // console.log('orgFromContributionScheme');
      // console.log(orgFromContributionScheme);
      assert.equal(orgFromContributionScheme, false);

      // check if we have the fee to register the contribution
      const contributionSchemeRegisterFee = await contributionScheme.fee();
      // console.log('contributionSchemeRegisterFee: ' + contributionSchemeRegisterFee);
      // our fee is 0, so that's easy  (TODO: write a test with non-zero fees)
      assert.equal(contributionSchemeRegisterFee, 0);

      // now we register it
      await contributionScheme.registerOrganization(avatar.address);

      // is the organization actually registered?
      orgFromContributionScheme = await contributionScheme.organizations(avatar.address);
      // console.log('orgFromContributionScheme after registering');
      assert.equal(orgFromContributionScheme, true);

      // check the configuration for proposing new contributions

      paramsHash = await controller.getSchemeParameters(contributionScheme.address);
      // params are: uint orgNativeTokenFee; bytes32 voteApproveParams; uint schemeNativeTokenFee;         BoolVoteInterface boolVote;
      params = await contributionScheme.parameters(paramsHash);
      // console.log('Parameters on contribution Scheme: ', params);
      // check if they are not trivial - the 4th item should be a valid boolVote address
      assert.notEqual(params[3], '0x0000000000000000000000000000000000000000');

      // now we can propose a contribution
      tx = await contributionScheme.submitContribution(
        avatar.address, // Avatar _avatar,
        'a fair play', // string _contributionDesciption,
        0, // uint _nativeTokenReward,
        0, // uint _reputationReward,
        0, // uint _ethReward,
        '0x0008e8314d3f08fd072e06b6253d62ed526038a0', // StandardToken _externalToken, we provide some arbitrary address
        0, // uint _externalTokenReward,
        accounts[2], // address _beneficiary
      );

      return 
      // console.log(tx.logs);
      const contributionId = tx.logs[0].args.proposalId;
      // let us vote for it (is there a way to get the votingmachine from the contributionScheme?)
      // this is a minority vote for 'yes'
      // check preconditions for the vote
      proposal = await votingMachine.proposals(contributionId);
      console.log(proposal);
      // a propsoal has the following structure
      // 0. address owner;
      // 1. address avatar;
      // 2. ExecutableInterface executable;
      // 3. bytes32 paramsHash;
      // 4. uint yes; // total 'yes' votes
      // 5. uint no; // total 'no' votes
      // 6.mapping(address=>int) voted; // save the amount of reputation voted by an agent (positive sign is yes, negatice is no)
      // 7. bool opened; // voting opened flag
      // 8. bool ended; // voting had ended flag
      // the prposal must be opened, but not ended
      assert.ok(proposal[7]); // proposal.opened is true
      assert.notOk(proposal[8]); // proposal.Ended is false
      tx = await votingMachine.vote(contributionId, true, founders[0], {from: founders[1]});

      // and this is the majority vote (which will also call execute)
      // tx = await votingMachine.vote(contributionId, true, founders[1], {from: founders[1]});

      console.log('DONE!')
    	return


//         let balance0BeforeSubmission = await this.tokenInstance.balanceOf(founders[0]);
//         let reputation0BeforeSubmission = await this.reputationInstance.reputationOf(founders[0]);

//         // submit contribution - for that need to aprrove token first
//         // approve token
//         await this.tokenInstance.approve(contributionScheme.address, submissionFee);
//         await this.tokenInstance.approve(contributionScheme.address, submissionFee);
//         // submit contribution
//         let askedTokens = 5;
//         let askedReputation = 55;

//         // do the first call ofchain in order to get the return value (instead of tx)
//         let contributionId = await contributionScheme.submitContribution.call("simple contribution testing",
//                                                                               askedTokens,
//                                                                               askedReputation,
//                                                                               founders[0],
//                                                                               {'from':founders[0]});
//         // do the same call onchain
//         await contributionScheme.submitContribution("simple contribution testing",
//                                                     askedTokens,
//                                                     askedReputation,
//                                                     founders[0],
//                                                     {'from':founders[0]});

//         // vote on contribution. 2nd founder has majority
//         await contributionScheme.voteContribution(contributionId,true,{'from':founders[1]});

//         // see that submitter was paid
//         let balance0AfterSubmission = await this.tokenInstance.balanceOf(founders[0]);
//         let reputation0AfterSubmission = await this.reputationInstance.reputationOf(founders[0]);

//         assert.equal(parseInt(reputation0BeforeSubmission.valueOf()) + parseInt(askedReputation.valueOf()),
//                      parseInt(reputation0AfterSubmission.valueOf()),
//                      "contributer reputation are not as expected");


//         assert.equal(parseInt(balance0BeforeSubmission.valueOf()) + parseInt(askedTokens) - parseInt(submissionFee),
//                      parseInt(balance0AfterSubmission.valueOf()),
//                      "contributer tokens are not as expected");
    });
});
