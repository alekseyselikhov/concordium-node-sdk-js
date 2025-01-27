import {
    AttributeKey,
    CredentialDeploymentTransaction,
    CredentialDeploymentInfo,
    CryptographicParameters,
    IdentityInput,
    UnsignedCdiWithRandomness,
    UnsignedCredentialDeploymentInformation,
    VerifyKey,
} from './types';
import * as wasm from '../pkg/node_sdk_helpers';
import { TransactionExpiry } from './types/transactionExpiry';
import { AccountAddress } from './types/accountAddress';
import { sha256 } from './hash';
import * as bs58check from 'bs58check';

/**
 * Generates the unsigned credential information that has to be signed when
 * deploying a credential. The randomness for the commitments that are part
 * of the transaction is also outputted, and it should be stored if the
 * commitments should be opened at a later point, i.e. if an attribute should
 * be revealed at a later point.
 * @param identity the identity to create a credential for
 * @param cryptographicParameters the global cryptographic parameters from the chain
 * @param threshold the signature threshold for the credential, has to be less than number of public keys
 * @param publicKeys the public keys for the account
 * @param credentialIndex the index of the credential to create, has to be in sequence and unused
 * @param revealedAttributes the attributes about the account holder that should be revealed on chain
 * @param address the account address, if the credential is to be deployed to an existing account
 * @returns the unsigned credential deployment information (for signing), and the randomness used
 */
function createUnsignedCredentialInfo(
    identity: IdentityInput,
    cryptographicParameters: CryptographicParameters,
    threshold: number,
    publicKeys: VerifyKey[],
    credentialIndex: number,
    revealedAttributes: AttributeKey[],
    address?: AccountAddress
): UnsignedCdiWithRandomness {
    if (publicKeys.length > 255) {
        throw new Error(
            'The number of keys is greater than what the transaction supports: ' +
                publicKeys.length
        );
    }

    const identityProvider = identity.identityProvider;
    const credentialInput: Record<string, unknown> = {
        ipInfo: identityProvider.ipInfo,
        arsInfos: identityProvider.arsInfos,
        global: cryptographicParameters,
        identityObject: identity.identityObject,
        randomness: {
            randomness: identity.randomness,
        },
        publicKeys,
        credentialNumber: credentialIndex,
        threshold,
        prfKey: identity.prfKey,
        idCredSec: identity.idCredSecret,
        revealedAttributes: revealedAttributes,
    };

    if (address) {
        credentialInput.address = address.address;
    }

    const unsignedCredentialDeploymentInfoString =
        wasm.generateUnsignedCredential(JSON.stringify(credentialInput));
    const result: UnsignedCdiWithRandomness = JSON.parse(
        unsignedCredentialDeploymentInfoString
    );
    return result;
}

/**
 * Create a credential deployment transaction, which is the transaction used
 * when deploying a new account.
 * @param identity the identity to create a credential for
 * @param cryptographicParameters the global cryptographic parameters from the chain
 * @param threshold the signature threshold for the credential, has to be less than number of public keys
 * @param publicKeys the public keys for the account
 * @param credentialIndex the index of the credential to create, has to be in sequence and unused
 * @param revealedAttributes the attributes about the account holder that should be revealed on chain
 * @param expiry the expiry of the transaction
 * @returns a credential deployment transaction
 */
export function createCredentialDeploymentTransaction(
    identity: IdentityInput,
    cryptographicParameters: CryptographicParameters,
    threshold: number,
    publicKeys: VerifyKey[],
    credentialIndex: number,
    revealedAttributes: AttributeKey[],
    expiry: TransactionExpiry
): CredentialDeploymentTransaction {
    const unsignedCredentialInfo = createUnsignedCredentialInfo(
        identity,
        cryptographicParameters,
        threshold,
        publicKeys,
        credentialIndex,
        revealedAttributes
    );
    return {
        unsignedCdi: unsignedCredentialInfo.unsignedCdi,
        randomness: unsignedCredentialInfo.randomness,
        expiry: expiry,
    };
}

/**
 * Create an unsigned credential for an existing account. This credential has to be signed by
 * the creator before it can be deployed on the existing account.
 * @param identity the identity to create a credential for
 * @param cryptographicParameters the global cryptographic parameters from the chain
 * @param threshold the signature threshold for the credential, has to be less than number of public keys
 * @param publicKeys the public keys for the credential
 * @param credentialIndex the index of the credential to create, has to be in sequence and unused
 * @param revealedAttributes the attributes about the account holder that should be revealed on chain
 * @param address the account address to associated the credential with
 */
export function createUnsignedCredentialForExistingAccount(
    identity: IdentityInput,
    cryptographicParameters: CryptographicParameters,
    threshold: number,
    publicKeys: VerifyKey[],
    credentialIndex: number,
    revealedAttributes: AttributeKey[],
    address: AccountAddress
): UnsignedCdiWithRandomness {
    return createUnsignedCredentialInfo(
        identity,
        cryptographicParameters,
        threshold,
        publicKeys,
        credentialIndex,
        revealedAttributes,
        address
    );
}

/**
 * Combines the unsigned credential information and the signatures to the signed credential
 * deployment information. This is the information that the account owner needs to be able
 * to deploy the credential to their account.
 * @param unsignedCredentialInfo the unsigned credential information
 * @param signatures the signatures on the unsigned credential information
 * @returns signed credential deployment information, used in an update credentials transaction to deploy it
 */
export function buildSignedCredentialForExistingAccount(
    unsignedCredentialInfo: UnsignedCredentialDeploymentInformation,
    signatures: string[]
): CredentialDeploymentInfo {
    const signedCredential: CredentialDeploymentInfo = JSON.parse(
        wasm.getDeploymentInfo(
            signatures,
            JSON.stringify(unsignedCredentialInfo)
        )
    );
    return signedCredential;
}

/**
 * Derives the account address from a credential id. This is the address of the
 * account that will be created by the credential deployment transaction containing
 * this credential id.
 * @param credId the credential id from a credential deployment transaction
 * @returns the account address
 */
export function getAccountAddress(credId: string): AccountAddress {
    const hashedCredId = sha256([Buffer.from(credId, 'hex')]);
    const prefixedWithVersion = Buffer.concat([Buffer.of(1), hashedCredId]);
    const accountAddress = new AccountAddress(
        bs58check.encode(prefixedWithVersion)
    );
    return accountAddress;
}
