import * as helpers from './helpers';
const SimpleContributionScheme = artifacts.require("./SimpleContributionScheme.sol");
const StandardTokenMock = artifacts.require('./test/StandardTokenMock.sol');
const GenesisScheme = artifacts.require("./GenesisScheme.sol");
const Avatar = artifacts.require("./Avatar.sol");


export class SimpleContributionParams {
  constructor() {
  }
}

const setupSimpleContributionParams = async function(
                                            simpleContribution,
                                            orgNativeTokenFee=0,
                                            schemeNativeTokenFee=0
                                            ) {
  var simpleContributionParams = new SimpleContributionParams();
  simpleContributionParams.votingMachine = await helpers.setupAbsoluteVote();
  simpleContributionParams.orgNativeTokenFee =  orgNativeTokenFee;
  simpleContributionParams.schemeNativeTokenFee = schemeNativeTokenFee;
  await simpleContribution.setParameters(simpleContributionParams.orgNativeTokenFee,
                                         simpleContributionParams.schemeNativeTokenFee,
                                         simpleContributionParams.votingMachine.params,
                                         simpleContributionParams.votingMachine.absoluteVote.address);
  simpleContributionParams.paramsHash = await simpleContribution.getParametersHash(simpleContributionParams.orgNativeTokenFee,
                                                                                   simpleContributionParams.schemeNativeTokenFee,
                                                                                   simpleContributionParams.votingMachine.params,
                                                                                   simpleContributionParams.votingMachine.absoluteVote.address);
  return simpleContributionParams;
};

const setup = async function (accounts,orgNativeTokenFee=0,schemeNativeTokenFee=0) {
   var testSetup = new helpers.TestSetup();
   testSetup.fee = 10;
   testSetup.standardTokenMock = await StandardTokenMock.new(accounts[1],100);
   testSetup.simpleContribution = await SimpleContributionScheme.new(testSetup.standardTokenMock.address,testSetup.fee,accounts[0]);
   testSetup.genesisScheme = await GenesisScheme.deployed();
   testSetup.org = await helpers.setupOrganization(testSetup.genesisScheme,accounts[0],1000,1000);
   testSetup.simpleContributionParams= await setupSimpleContributionParams(testSetup.simpleContribution,orgNativeTokenFee,schemeNativeTokenFee);
   await testSetup.genesisScheme.setSchemes(testSetup.org.avatar.address,[testSetup.simpleContribution.address],[testSetup.simpleContributionParams.paramsHash],[testSetup.standardTokenMock.address],[100],["0x0000000F"]);
   //give some tokens to organization avatar so it could register the univeral scheme.
   await testSetup.standardTokenMock.transfer(testSetup.org.avatar.address,30,{from:accounts[1]});
   return testSetup;
};
contract('SimpleContribution', function(accounts) {

   it("constructor", async function() {
    var standardTokenMock = await StandardTokenMock.new(accounts[0],100);
    var simpleContribution = await SimpleContributionScheme.new(standardTokenMock.address,10,accounts[1]);
    var token = await simpleContribution.nativeToken();
    assert.equal(token,standardTokenMock.address);
    var fee = await simpleContribution.fee();
    assert.equal(fee,10);
    var beneficiary = await simpleContribution.beneficiary();
    assert.equal(beneficiary,accounts[1]);
   });

   it("setParameters", async function() {
     var standardTokenMock = await StandardTokenMock.new(accounts[0],100);
     var simpleContribution = await SimpleContributionScheme.new(standardTokenMock.address,10,accounts[1]);
     var params = await setupSimpleContributionParams(simpleContribution);
     var parameters = await simpleContribution.parameters(params.paramsHash);
     assert.equal(parameters[3],params.votingMachine.absoluteVote.address);
     });

   it("registerOrganization - check fee payment ", async function() {
     var testSetup = await setup(accounts);
     await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
     var balanceOfBeneficiary  = await testSetup.standardTokenMock.balanceOf(accounts[0]);
     assert.equal(balanceOfBeneficiary.toNumber(),testSetup.fee);
     assert.equal(await testSetup.simpleContribution.isRegistered(testSetup.org.avatar.address),true);
    });

    it("submitContribution log", async function() {
      var testSetup = await setup(accounts,0,0);
      await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
      var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                     "description",
                                                                     0,
                                                                     0,
                                                                     0,
                                                                     testSetup.standardTokenMock.address,
                                                                     0,
                                                                     accounts[0]);
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, "LogNewContributionProposal");
     });

     it("submitContribution fees", async function() {
       var testSetup = await setup(accounts,14,10);

       await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
       var balanceBefore  = await testSetup.standardTokenMock.balanceOf(testSetup.org.avatar.address);
       //give approval to scheme to do the fees transfer
       await testSetup.org.token.approve(testSetup.simpleContribution.address,100);
       await testSetup.standardTokenMock.approve(testSetup.simpleContribution.address,100);
       var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                      "description",
                                                                      0,
                                                                      0,
                                                                      0,
                                                                      testSetup.standardTokenMock.address,
                                                                      0,
                                                                      accounts[0],
                                                                      {from:accounts[0]}
                                                                    );
       assert.equal(tx.logs.length, 1);
       assert.equal(tx.logs[0].event, "LogNewContributionProposal");
       var balance  = await testSetup.org.token.balanceOf(testSetup.org.avatar.address);
       assert.equal(balance.toNumber(),testSetup.simpleContributionParams.orgNativeTokenFee);
       balance  = await testSetup.standardTokenMock.balanceOf(testSetup.org.avatar.address);
       assert.equal(balance.toNumber(),testSetup.simpleContributionParams.schemeNativeTokenFee+balanceBefore.toNumber());
      });

     it("submitContribution without regisration -should fail", async function() {
       var testSetup = await setup(accounts);
       try{
         await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                        "description",
                                                                        0,
                                                                        0,
                                                                        0,
                                                                        testSetup.standardTokenMock.address,
                                                                        0,
                                                                        accounts[0]
                                                                      );
       assert(false,"proposeScheme should  fail - due to no registration !");
       }catch(ex){
         helpers.assertVMException(ex);
       }
      });

      it("submitContribution check owner vote", async function() {
        var testSetup = await setup(accounts);
        await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
        var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                       "description",
                                                                       0,
                                                                       0,
                                                                       0,
                                                                       testSetup.standardTokenMock.address,
                                                                       0,
                                                                       accounts[0]
                                                                     );
        var proposalId = await helpers.getValueFromLogs(tx, '_proposalId',1);
        await helpers.checkVoteInfo(testSetup.simpleContributionParams.votingMachine.absoluteVote,proposalId,accounts[0],[1,testSetup.simpleContributionParams.votingMachine.reputationArray[0]]);
       });

       it("submitContribution check beneficiary==0", async function() {
         var testSetup = await setup(accounts);
         var beneficiary = 0;
         await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
         var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                        "description",
                                                                        0,
                                                                        0,
                                                                        0,
                                                                        testSetup.standardTokenMock.address,
                                                                        0,
                                                                        beneficiary
                                                                      );
         assert.equal(await helpers.getValueFromLogs(tx, '_beneficiary'),accounts[0]);
        });

    it("execute submitContribution  yes ", async function() {
      var testSetup = await setup(accounts);
      await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
      var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                     "description",
                                                                     0,
                                                                     0,
                                                                     0,
                                                                     testSetup.standardTokenMock.address,
                                                                     0,
                                                                     accounts[0]
                                                                   );
      //Vote with reputation to trigger execution
      var proposalId = await helpers.getValueFromLogs(tx, '_proposalId',1);
      await testSetup.simpleContributionParams.votingMachine.absoluteVote.vote(proposalId,1,{from:accounts[2]});
      var organizationsProposals = await testSetup.simpleContribution.organizationsProposals(testSetup.org.avatar.address,proposalId);
      assert.equal(organizationsProposals[6],0);//beneficiary
     });

      it("execute submitContribution  mint reputation ", async function() {
        var testSetup = await setup(accounts);
        var reputationReward = 12;
        await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
        var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                       "description",
                                                                       0,
                                                                       reputationReward,
                                                                       0,
                                                                       testSetup.standardTokenMock.address,
                                                                       0,
                                                                       accounts[1]
                                                                     );
        //Vote with reputation to trigger execution
        var proposalId = await helpers.getValueFromLogs(tx, '_proposalId',1);
        await testSetup.simpleContributionParams.votingMachine.absoluteVote.vote(proposalId,1,{from:accounts[2]});
        var rep = await testSetup.org.reputation.reputationOf(accounts[1]);
        assert.equal(rep.toNumber(),reputationReward);
       });

       it("execute submitContribution  mint tokens ", async function() {
         var testSetup = await setup(accounts);
         var reputationReward = 12;
         var nativeTokenReward = 12;
         await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
         var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                        "description",
                                                                        nativeTokenReward,
                                                                        reputationReward,
                                                                        0,
                                                                        testSetup.standardTokenMock.address,
                                                                        0,
                                                                        accounts[1]
                                                                      );
         //Vote with reputation to trigger execution
         var proposalId = await helpers.getValueFromLogs(tx, '_proposalId',1);
         await testSetup.simpleContributionParams.votingMachine.absoluteVote.vote(proposalId,1,{from:accounts[2]});
         var tokens = await testSetup.org.token.balanceOf(accounts[1]);
         assert.equal(tokens.toNumber(),nativeTokenReward);
        });

        it("execute submitContribution  send ethers ", async function() {
          var testSetup = await setup(accounts);
          var reputationReward = 12;
          var nativeTokenReward = 12;
          var ethReward = 12;
          await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
          //send some ether to the org avatar
          var otherAvatar = await Avatar.new();
          web3.eth.sendTransaction({from:accounts[0],to:testSetup.org.avatar.address, value:20});
          var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                         "description",
                                                                         nativeTokenReward,
                                                                         reputationReward,
                                                                         ethReward,
                                                                         testSetup.standardTokenMock.address,
                                                                         0,
                                                                         otherAvatar.address
                                                                       );
          //Vote with reputation to trigger execution
          var proposalId = await helpers.getValueFromLogs(tx, '_proposalId',1);
          await testSetup.simpleContributionParams.votingMachine.absoluteVote.vote(proposalId,1,{from:accounts[2]});
          var eth = web3.eth.getBalance(otherAvatar.address);
          assert.equal(eth.toNumber(),ethReward);
         });

         it("execute submitContribution  send externalToken ", async function() {
           var testSetup = await setup(accounts);
           var reputationReward = 12;
           var nativeTokenReward = 12;
           var ethReward = 12;
           var externalTokenReward = 12;
           await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
           //send some ether to the org avatar
           var otherAvatar = await Avatar.new();
           web3.eth.sendTransaction({from:accounts[0],to:testSetup.org.avatar.address, value:20});
           var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                          "description",
                                                                          nativeTokenReward,
                                                                          reputationReward,
                                                                          ethReward,
                                                                          testSetup.standardTokenMock.address,
                                                                          externalTokenReward,
                                                                          otherAvatar.address
                                                                        );
           //Vote with reputation to trigger execution
           var proposalId = await helpers.getValueFromLogs(tx, '_proposalId',1);
           await testSetup.simpleContributionParams.votingMachine.absoluteVote.vote(proposalId,1,{from:accounts[2]});
           var tokens = await testSetup.standardTokenMock.balanceOf(otherAvatar.address);
           assert.equal(tokens.toNumber(),externalTokenReward);
          });

          it("execute submitContribution proposal decision=='no' send externalToken  ", async function() {
            var testSetup = await setup(accounts);
            var reputationReward = 12;
            var nativeTokenReward = 12;
            var ethReward = 12;
            var externalTokenReward = 12;
            await testSetup.simpleContribution.registerOrganization(testSetup.org.avatar.address);
            //send some ether to the org avatar
            var otherAvatar = await Avatar.new();
            web3.eth.sendTransaction({from:accounts[0],to:testSetup.org.avatar.address, value:20});
            var tx = await testSetup.simpleContribution.submitContribution(testSetup.org.avatar.address,
                                                                           "description",
                                                                           nativeTokenReward,
                                                                           reputationReward,
                                                                           ethReward,
                                                                           testSetup.standardTokenMock.address,
                                                                           externalTokenReward,
                                                                           otherAvatar.address
                                                                         );
            //Vote with reputation to trigger execution
            var proposalId = await helpers.getValueFromLogs(tx, '_proposalId',1);
            var organizationsProposals = await testSetup.simpleContribution.organizationsProposals(testSetup.org.avatar.address,proposalId);
            assert.equal(organizationsProposals[6],otherAvatar.address);//beneficiary
            await testSetup.simpleContributionParams.votingMachine.absoluteVote.vote(proposalId,0,{from:accounts[2]});
            var tokens = await testSetup.standardTokenMock.balanceOf(otherAvatar.address);
            assert.equal(tokens.toNumber(),0);
            organizationsProposals = await testSetup.simpleContribution.organizationsProposals(testSetup.org.avatar.address,proposalId);
            assert.equal(organizationsProposals[6],0);//beneficiary
           });
});
