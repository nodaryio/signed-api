import { ethers } from "ethers";
import { SignedData } from "./types";

export const testSignedData: SignedData = {
  feedName: "ETH/USD",
  oisTitle: "Nodary",
  airnode: "0xc52EeA00154B4fF1EbbF8Ba39FDe37F1AC3B9Fd4",
  beaconId: "0x4385954e058fbe6b6a744f32a4f89d67aad099f8fb8b23e7ea8dd366ae88151d",
  endpointId: "0x3528e42b017a5fbf9d2993a2df04efc3ed474357575065a111b054ddf9de2acc",
  templateId: "0x154c34adf151cf4d91b7abe7eb6dcd193104ef2a29738ddc88020a58d6cf6183",
  parameters:
    "0x31730000000000000000000000000000000000000000000000000000000000006e616d65000000000000000000000000000000000000000000000000000000004554482f55534400000000000000000000000000000000000000000000000000",
  timestamp: "1683188416",
  encodedValue: "0x000000000000000000000000000000000000000000000066f1ebe9b82d875640",
  signature:
    "0x2adfd57e47f52243d537514ad2d42729eac14739080c5c498773829dfb82e43a2fbba4f2ddb24b5e7de00dca849a3f75cb1d36026c92167fc89a0855f5a487b91b",
};

const decodeData = (data: string) => ethers.utils.defaultAbiCoder.decode(["int256"], data);

const packAndHashWithTemplateId = (templateId: string, timestamp: string, data: string) =>
  ethers.utils.arrayify(
    ethers.utils.keccak256(
      ethers.utils.solidityPack(["bytes32", "uint256", "bytes"], [templateId, timestamp, data || "0x"]),
    ),
  );

export const deriveBeaconId = (airnode: string, templateId: string) =>
  ethers.utils.keccak256(ethers.utils.solidityPack(["address", "bytes32"], [airnode, templateId]));

export const signWithTemplateId = (airnodeWallet: ethers.Wallet, templateId: string, timestamp: string, data: string) =>
  airnodeWallet.signMessage(
    ethers.utils.arrayify(
      ethers.utils.keccak256(
        ethers.utils.solidityPack(["bytes32", "uint256", "bytes"], [templateId, timestamp, data || "0x"]),
      ),
    ),
  );

export const recoverSignerAddress = (data: SignedData): string => {
  const digest = packAndHashWithTemplateId(data.templateId, data.timestamp, data.encodedValue);
  return ethers.utils.verifyMessage(digest, data.signature);
};
