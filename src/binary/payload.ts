// Copyright 2020 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0
import { Ed25519 } from "../crypto/ed25519";
import { IIndexationPayload, INDEXATION_PAYLOAD_TYPE } from "../models/IIndexationPayload";
import { IMilestonePayload, MILESTONE_PAYLOAD_TYPE } from "../models/IMilestonePayload";
import { IReceiptPayload, RECEIPT_PAYLOAD_TYPE } from "../models/IReceiptPayload";
import { TRANSACTION_ESSENCE_TYPE } from "../models/ITransactionEssence";
import { ITransactionPayload, TRANSACTION_PAYLOAD_TYPE } from "../models/ITransactionPayload";
import { ITypeBase } from "../models/ITypeBase";
import { ReadStream } from "../utils/readStream";
import { WriteStream } from "../utils/writeStream";
import { BYTE_SIZE, MERKLE_PROOF_LENGTH, MESSAGE_ID_LENGTH, STRING_LENGTH, TYPE_LENGTH, UINT16_SIZE, UINT32_SIZE, UINT64_SIZE } from "./common";
import { deserializeFunds, MIN_MIGRATED_FUNDS_LENGTH, serializeFunds } from "./funds";
import { deserializeTransactionEssence, serializeTransactionEssence } from "./transaction";
import { deserializeUnlockBlocks, serializeUnlockBlocks } from "./unlockBlock";

/**
 * The minimum length of a payload binary representation.
 */
export const MIN_PAYLOAD_LENGTH: number = TYPE_LENGTH;

/**
 * The minimum length of a milestone payload binary representation.
 */
export const MIN_MILESTONE_PAYLOAD_LENGTH: number =
    MIN_PAYLOAD_LENGTH + // min payload
    UINT32_SIZE + // index
    UINT64_SIZE + // timestamp
    MESSAGE_ID_LENGTH + // parent 1
    MESSAGE_ID_LENGTH + // parent 2
    MERKLE_PROOF_LENGTH + // merkle proof
    BYTE_SIZE + // publicKeysCount
    Ed25519.PUBLIC_KEY_SIZE + // 1 public key
    BYTE_SIZE + // signatireCount
    Ed25519.SIGNATURE_SIZE; // 1 signature

/**
 * The minimum length of an indexation payload binary representation.
 */
export const MIN_INDEXATION_PAYLOAD_LENGTH: number =
    MIN_PAYLOAD_LENGTH + // min payload
    STRING_LENGTH + // index length
    1 + // index min 1 byte
    STRING_LENGTH; // data length

/**
 * The minimum length of a transaction payload binary representation.
 */
export const MIN_TRANSACTION_PAYLOAD_LENGTH: number =
    MIN_PAYLOAD_LENGTH + // min payload
    UINT32_SIZE; // essence type

/**
 * The minimum length of a receipt payload binary representation.
 */
export const MIN_RECEIPT_PAYLOAD_LENGTH: number =
    MIN_PAYLOAD_LENGTH +
    UINT32_SIZE + // migratedAt
    UINT16_SIZE + // numFunds
    MIN_MIGRATED_FUNDS_LENGTH; // 1 Fund

/**
 * The minimum length of a indexation key.
 */
export const MIN_INDEXATION_KEY_LENGTH: number = 1;

/**
 * The maximum length of a indexation key.
 */
export const MAX_INDEXATION_KEY_LENGTH: number = 64;

/**
 * Deserialize the payload from binary.
 * @param readStream The stream to read the data from.
 * @returns The deserialized object.
 */
export function deserializePayload(readStream: ReadStream):
    IIndexationPayload | IMilestonePayload | ITransactionPayload | IReceiptPayload | undefined {
    if (!readStream.hasRemaining(MIN_PAYLOAD_LENGTH)) {
        throw new Error(`Payload data is ${readStream.length()
            } in length which is less than the minimimum size required of ${MIN_PAYLOAD_LENGTH}`);
    }

    const payloadLength = readStream.readUInt32("payload.length");

    if (!readStream.hasRemaining(payloadLength)) {
        throw new Error(`Payload length ${payloadLength
            } exceeds the remaining data ${readStream.unused()}`);
    }

    let payload: IIndexationPayload | IMilestonePayload | ITransactionPayload | IReceiptPayload | undefined;

    if (payloadLength > 0) {
        const payloadType = readStream.readUInt32("payload.type", false);

        if (payloadType === TRANSACTION_PAYLOAD_TYPE) {
            payload = deserializeTransactionPayload(readStream);
        } else if (payloadType === MILESTONE_PAYLOAD_TYPE) {
            payload = deserializeMilestonePayload(readStream);
        } else if (payloadType === INDEXATION_PAYLOAD_TYPE) {
            payload = deserializeIndexationPayload(readStream);
        } else if (payloadType === RECEIPT_PAYLOAD_TYPE) {
            payload = deserializeReceiptPayload(readStream);
        } else {
            throw new Error(`Unrecognized payload type ${payloadType}`);
        }
    }

    return payload;
}

/**
 * Serialize the payload essence to binary.
 * @param writeStream The stream to write the data to.
 * @param object The object to serialize.
 */
export function serializePayload(writeStream: WriteStream,
    object: IIndexationPayload | IMilestonePayload | ITransactionPayload | IReceiptPayload | undefined): void {
    // Store the location for the payload length and write 0
    // we will rewind and fill in once the size of the payload is known
    const payloadLengthWriteIndex = writeStream.getWriteIndex();
    writeStream.writeUInt32("payload.length", 0);

    if (!object) {
        // No other data to write
    } else if (object.type === TRANSACTION_PAYLOAD_TYPE) {
        serializeTransactionPayload(writeStream, object);
    } else if (object.type === MILESTONE_PAYLOAD_TYPE) {
        serializeMilestonePayload(writeStream, object);
    } else if (object.type === INDEXATION_PAYLOAD_TYPE) {
        serializeIndexationPayload(writeStream, object);
    } else if (object.type === RECEIPT_PAYLOAD_TYPE) {
        serializeReceiptPayload(writeStream, object);
    } else {
        throw new Error(`Unrecognized transaction type ${(object as ITypeBase<unknown>).type}`);
    }

    const endOfPayloadWriteIndex = writeStream.getWriteIndex();
    writeStream.setWriteIndex(payloadLengthWriteIndex);
    writeStream.writeUInt32("payload.length", endOfPayloadWriteIndex - payloadLengthWriteIndex - UINT32_SIZE);
    writeStream.setWriteIndex(endOfPayloadWriteIndex);
}

/**
 * Deserialize the transaction payload from binary.
 * @param readStream The stream to read the data from.
 * @returns The deserialized object.
 */
export function deserializeTransactionPayload(readStream: ReadStream): ITransactionPayload {
    if (!readStream.hasRemaining(MIN_TRANSACTION_PAYLOAD_LENGTH)) {
        throw new Error(`Transaction Payload data is ${readStream.length()
            } in length which is less than the minimimum size required of ${MIN_TRANSACTION_PAYLOAD_LENGTH}`);
    }

    const type = readStream.readUInt32("payloadTransaction.type");
    if (type !== TRANSACTION_PAYLOAD_TYPE) {
        throw new Error(`Type mismatch in payloadTransaction ${type}`);
    }

    const essenceType = readStream.readByte("payloadTransaction.essenceType", false);
    let essence;
    let unlockBlocks;

    if (essenceType === TRANSACTION_ESSENCE_TYPE) {
        essence = deserializeTransactionEssence(readStream);
        unlockBlocks = deserializeUnlockBlocks(readStream);
    } else {
        throw new Error(`Unrecognized transaction essence type ${type}`);
    }

    return {
        type: TRANSACTION_PAYLOAD_TYPE,
        essence,
        unlockBlocks
    };
}

/**
 * Serialize the transaction payload essence to binary.
 * @param writeStream The stream to write the data to.
 * @param object The object to serialize.
 */
export function serializeTransactionPayload(writeStream: WriteStream,
    object: ITransactionPayload): void {
    writeStream.writeUInt32("payloadMilestone.type", object.type);

    if (object.type === TRANSACTION_PAYLOAD_TYPE) {
        serializeTransactionEssence(writeStream, object.essence);
        serializeUnlockBlocks(writeStream, object.unlockBlocks);
    } else {
        throw new Error(`Unrecognized transaction type ${(object as ITypeBase<unknown>).type}`);
    }
}

/**
 * Deserialize the milestone payload from binary.
 * @param readStream The stream to read the data from.
 * @returns The deserialized object.
 */
export function deserializeMilestonePayload(readStream: ReadStream): IMilestonePayload {
    if (!readStream.hasRemaining(MIN_MILESTONE_PAYLOAD_LENGTH)) {
        throw new Error(`Milestone Payload data is ${readStream.length()
            } in length which is less than the minimimum size required of ${MIN_MILESTONE_PAYLOAD_LENGTH}`);
    }

    const type = readStream.readUInt32("payloadMilestone.type");
    if (type !== MILESTONE_PAYLOAD_TYPE) {
        throw new Error(`Type mismatch in payloadMilestone ${type}`);
    }
    const index = readStream.readUInt32("payloadMilestone.index");
    const timestamp = readStream.readUInt64("payloadMilestone.timestamp");
    const parent1MessageId = readStream.readFixedHex("payloadMilestone.parent1MessageId", MESSAGE_ID_LENGTH);
    const parent2MessageId = readStream.readFixedHex("payloadMilestone.parent2MessageId", MESSAGE_ID_LENGTH);
    const inclusionMerkleProof = readStream.readFixedHex("payloadMilestone.inclusionMerkleProof", MERKLE_PROOF_LENGTH);
    const publicKeysCount = readStream.readByte("payloadMilestone.publicKeysCount");
    const publicKeys = [];
    for (let i = 0; i < publicKeysCount; i++) {
        publicKeys.push(readStream.readFixedHex("payloadMilestone.publicKey", Ed25519.PUBLIC_KEY_SIZE));
    }

    const receipt = deserializePayload(readStream);
    if (receipt && receipt.type !== RECEIPT_PAYLOAD_TYPE) {
        throw new Error("Milestones only support embedded receipt payload type");
    }

    const signaturesCount = readStream.readByte("payloadMilestone.signaturesCount");
    const signatures = [];
    for (let i = 0; i < signaturesCount; i++) {
        signatures.push(readStream.readFixedHex("payloadMilestone.signature", Ed25519.SIGNATURE_SIZE));
    }

    return {
        type: MILESTONE_PAYLOAD_TYPE,
        index,
        timestamp: Number(timestamp),
        parent1MessageId,
        parent2MessageId,
        inclusionMerkleProof,
        publicKeys,
        receipt,
        signatures
    };
}

/**
 * Serialize the milestone payload essence to binary.
 * @param writeStream The stream to write the data to.
 * @param object The object to serialize.
 */
export function serializeMilestonePayload(writeStream: WriteStream,
    object: IMilestonePayload): void {
    writeStream.writeUInt32("payloadMilestone.type", object.type);
    writeStream.writeUInt32("payloadMilestone.index", object.index);
    writeStream.writeUInt64("payloadMilestone.timestamp", BigInt(object.timestamp));
    writeStream.writeFixedHex("payloadMilestone.parent1MessageId", MESSAGE_ID_LENGTH, object.parent1MessageId);
    writeStream.writeFixedHex("payloadMilestone.parent2MessageId", MESSAGE_ID_LENGTH, object.parent2MessageId);

    writeStream.writeFixedHex("payloadMilestone.inclusionMerkleProof",
        MERKLE_PROOF_LENGTH, object.inclusionMerkleProof);
    writeStream.writeByte("payloadMilestone.publicKeysCount", object.publicKeys.length);
    for (let i = 0; i < object.publicKeys.length; i++) {
        writeStream.writeFixedHex("payloadMilestone.publicKey", Ed25519.PUBLIC_KEY_SIZE, object.publicKeys[i]);
    }

    serializePayload(writeStream, object.receipt);

    writeStream.writeByte("payloadMilestone.signaturesCount", object.signatures.length);
    for (let i = 0; i < object.signatures.length; i++) {
        writeStream.writeFixedHex("payloadMilestone.signature", Ed25519.SIGNATURE_SIZE, object.signatures[i]);
    }
}

/**
 * Deserialize the indexation payload from binary.
 * @param readStream The stream to read the data from.
 * @returns The deserialized object.
 */
export function deserializeIndexationPayload(readStream: ReadStream): IIndexationPayload {
    if (!readStream.hasRemaining(MIN_INDEXATION_PAYLOAD_LENGTH)) {
        throw new Error(`Indexation Payload data is ${readStream.length()
            } in length which is less than the minimimum size required of ${MIN_INDEXATION_PAYLOAD_LENGTH}`);
    }

    const type = readStream.readUInt32("payloadIndexation.type");
    if (type !== INDEXATION_PAYLOAD_TYPE) {
        throw new Error(`Type mismatch in payloadIndexation ${type}`);
    }
    const index = readStream.readString("payloadIndexation.index");
    const dataLength = readStream.readUInt32("payloadIndexation.dataLength");
    const data = readStream.readFixedHex("payloadIndexation.data", dataLength);

    return {
        type: INDEXATION_PAYLOAD_TYPE,
        index,
        data
    };
}

/**
 * Serialize the indexation payload essence to binary.
 * @param writeStream The stream to write the data to.
 * @param object The object to serialize.
 */
export function serializeIndexationPayload(writeStream: WriteStream,
    object: IIndexationPayload): void {
    if (object.index.length < MIN_INDEXATION_KEY_LENGTH) {
        throw new Error(`The indexation key length is ${object.index.length
            }, which is below the minimum size of ${MIN_INDEXATION_KEY_LENGTH}`);
    }
    if (object.index.length > MAX_INDEXATION_KEY_LENGTH) {
        throw new Error(`The indexation key length is ${object.index.length
            }, which exceeds the maximum size of ${MAX_INDEXATION_KEY_LENGTH}`);
    }

    writeStream.writeUInt32("payloadIndexation.type", object.type);
    writeStream.writeString("payloadIndexation.index", object.index);
    if (object.data) {
        writeStream.writeUInt32("payloadIndexation.dataLength", object.data.length / 2);
        writeStream.writeFixedHex("payloadIndexation.data", object.data.length / 2, object.data);
    } else {
        writeStream.writeUInt32("payloadIndexation.dataLength", 0);
    }
}

/**
 * Deserialize the receipt payload from binary.
 * @param readStream The stream to read the data from.
 * @returns The deserialized object.
 */
export function deserializeReceiptPayload(readStream: ReadStream): IReceiptPayload {
    if (!readStream.hasRemaining(MIN_RECEIPT_PAYLOAD_LENGTH)) {
        throw new Error(`Receipt Payload data is ${readStream.length()
            } in length which is less than the minimimum size required of ${MIN_RECEIPT_PAYLOAD_LENGTH}`);
    }

    const type = readStream.readUInt32("payloadReceipt.type");
    if (type !== RECEIPT_PAYLOAD_TYPE) {
        throw new Error(`Type mismatch in payloadReceipt ${type}`);
    }
    const migratedAt = readStream.readUInt32("payloadReceipt.migratedAt");

    const funds = deserializeFunds(readStream);

    return {
        type: RECEIPT_PAYLOAD_TYPE,
        migratedAt,
        funds
    };
}

/**
 * Serialize the indexation payload essence to binary.
 * @param writeStream The stream to write the data to.
 * @param object The object to serialize.
 */
export function serializeReceiptPayload(writeStream: WriteStream,
    object: IReceiptPayload): void {
    writeStream.writeUInt32("payloadReceipt.type", object.type);
    writeStream.writeUInt32("payloadReceipt.migratedAt", object.migratedAt);

    serializeFunds(writeStream, object.funds);
}
