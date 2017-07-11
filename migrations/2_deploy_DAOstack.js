// Imports:
var UniversalSimpleVote = artifacts.require('./UniversalSimpleVote.sol');
var GenesisScheme = artifacts.require('./schemes/GenesisScheme.sol');
var SchemeRegistrar = artifacts.require('./schemes/SchemeRegistrar.sol');
var GlobalConstraintRegistrar = artifacts.require('./schemes/GlobalConstraintRegistrar.sol');
var UpgradeScheme = artifacts.require('./UpgradeScheme.sol');
var Controller = artifacts.require('./schemes/controller/Controller.sol');
var MintableToken = artifacts.require('./schemes/controller/MintableToken.sol');
var Reputation = artifacts.require('./schemes/controller/Reputation.sol');
var Avatar = artifacts.require('./schemes/controller/Avatar.sol');

// Instances:
var simpleVoteInst;
var UniversalGenesisSchemeInst;
var schemeRegistrarInst;
var UniversalGCRegisterInst;
var UniversalUpgradeSchemeInst;
var ControllerInst;
var OrganizationsBoardInst;
var ReputationInst;
var MintableTokenInst;
var AvatarInst;
var SimpleICOInst;

// DAOstack ORG parameters:
var orgName = "DAOstack";
var tokenName = "Stack";
var tokenSymbol = "STK";
var founders = [web3.eth.accounts[0]];
var initRep = 10;
var initRepInWei = [web3.toWei(initRep)];
var initToken = 1000;
var initTokenInWei = [web3.toWei(initToken)];
var tokenAddress;
var reputationAddress;
var avatarAddress;
var controllerAddress;

// DAOstack parameters for universal schemes:
var voteParametersHash;
var votePrec = 50;
var schemeRegisterParams;
var schemeGCRegisterParams;
var schemeUpgradeParams;

// Universal schemes fees:
var UniversalRegisterFee = web3.toWei(5);

module.exports = async function(deployer) {
    // Deploy GenesisScheme:
    // apparently we must wrap the first deploy call in a then to avoid
    // what seem to be race conditions during deployment
    // await deployer.deploy(GenesisScheme)
    deployer.deploy(GenesisScheme).then(async function(){

        genesisSchemeInst = await GenesisScheme.deployed();
        // Create DAOstack:
        returnedParams = await genesisSchemeInst.forgeOrg(orgName, tokenName, tokenSymbol, founders,
            initTokenInWei, initRepInWei);
        AvatarInst = await Avatar.at(returnedParams.logs[0].args._avatar);
        avatarAddress = AvatarInst.address;
        controllerAddress = await AvatarInst.owner();
        ControllerInst = await Controller.at(controllerAddress);
        tokenAddress = await ControllerInst.nativeToken();
        reputationAddress = await ControllerInst.nativeReputation();
        MintableTokenInst = await MintableToken.at(tokenAddress);
        await deployer.deploy(UniversalSimpleVote);
        // Deploy UniversalSimpleVote:
        simpleVoteInst = await UniversalSimpleVote.deployed();
        // Deploy SchemeRegistrar:
        await deployer.deploy(SchemeRegistrar, tokenAddress, UniversalRegisterFee, avatarAddress);
        schemeRegistrarInst = await SchemeRegistrar.deployed();
        // Deploy UniversalUpgrade:
        await deployer.deploy(UpgradeScheme, tokenAddress, UniversalRegisterFee, avatarAddress);
        UniversalUpgradeSchemeInst = await UpgradeScheme.deployed();
        // Deploy UniversalGCScheme register:
        await deployer.deploy(GlobalConstraintRegistrar, tokenAddress, UniversalRegisterFee, avatarAddress);
        UniversalGCRegisterInst = await GlobalConstraintRegistrar.deployed();

        // Voting parameters and schemes params:
        voteParametersHash = await simpleVoteInst.hashParameters(reputationAddress, votePrec);
        schemeRegisterParams = await schemeRegistrarInst.parametersHash(voteParametersHash, voteParametersHash, simpleVoteInst.address);
        schemeGCRegisterParams = await UniversalGCRegisterInst.parametersHash(voteParametersHash, simpleVoteInst.address);
        schemeUpgradeParams = await UniversalUpgradeSchemeInst.parametersHash(voteParametersHash, simpleVoteInst.address);

        // Transferring tokens to org to pay fees:
        await MintableTokenInst.transfer(AvatarInst.address, 3*UniversalRegisterFee);

        var schemesArray = [schemeRegistrarInst.address, UniversalGCRegisterInst.address, UniversalUpgradeSchemeInst.address];
        var paramsArray = [schemeRegisterParams, schemeGCRegisterParams, schemeUpgradeParams];
        var permissionArray = [3, 5, 9];
        var tokenArray = [tokenAddress, tokenAddress, tokenAddress];
        var feeArray = [UniversalRegisterFee, UniversalRegisterFee, UniversalRegisterFee];

        // set DAOstack initial schmes:
        await genesisSchemeInst.setInitialSchemes(
          AvatarInst.address,
          schemesArray,
          paramsArray,
          tokenArray,
          feeArray,
          permissionArray);

        // Set SchemeRegistrar nativeToken and register DAOstack to it:
        await schemeRegistrarInst.addOrUpdateOrg(AvatarInst.address);
        await UniversalGCRegisterInst.addOrUpdateOrg(AvatarInst.address, voteParametersHash, simpleVoteInst.address);
        await UniversalUpgradeSchemeInst.addOrUpdateOrg(AvatarInst.address, voteParametersHash, simpleVoteInst.address);

        return;
    })
};
