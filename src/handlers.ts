import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import AWS from "aws-sdk";
import { signedDataSchema } from "./types";
import { go, goSync } from "@api3/promise-utils";
import { isNil } from "lodash";
import { deriveBeaconId, recoverSignerAddress, testSignedData } from "./evm";

const docClient = new AWS.DynamoDB.DocumentClient();
const tableName = "signedDataPool";
const headers = {
  "content-type": "application/json",
};

export const upsertData = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (isNil(event.body)) return { statusCode: 400, headers, body: "invalid request, missing http body" };

  const goJsonParseBody = goSync(() => JSON.parse(event.body as string));
  if (!goJsonParseBody.success) return { statusCode: 400, headers, body: "invalid request, body must be in JSON" };

  const goValidateSchema = await go(() => signedDataSchema.parseAsync(goJsonParseBody.data));
  if (!goValidateSchema.success)
    return { statusCode: 400, headers, body: `invalid request, ${goValidateSchema.error.message}` };

  const signedData = goValidateSchema.data;

  const goRecoverSigner = goSync(() => recoverSignerAddress(signedData));
  if (!goRecoverSigner.success)
    return { statusCode: 400, headers, body: `unable to recover signer address, ${goRecoverSigner.error.message}` };

  if (signedData.airnode !== goRecoverSigner.data) return { statusCode: 400, headers, body: `signature is invalid` };

  const goDeriveBeaconId = goSync(() => deriveBeaconId(signedData.airnode, signedData.templateId));
  if (!goDeriveBeaconId.success)
    return {
      statusCode: 400,
      headers,
      body: `unable to derive beaconId by given airnode and templateId, ${goDeriveBeaconId.error.message}`,
    };

  if (signedData.beaconId !== goDeriveBeaconId.data) return { statusCode: 400, headers, body: `beaconId is invalid` };

  const goReadDb = await go(() =>
    docClient.get({ TableName: tableName, Key: { beaconId: signedData.beaconId } }).promise(),
  );
  if (!goReadDb.success)
    return {
      statusCode: 500,
      headers,
      body: `unable to get signed data from dynamodb to validate timestamp, ${goReadDb.error.message}`,
    };

  if (!isNil(goReadDb.data.Item) && parseInt(signedData.timestamp) <= parseInt(goReadDb.data.Item.timestamp))
    return { statusCode: 400, headers, body: `request isn't updating the timestamp` };

  const goWriteDb = await go(() => docClient.put({ TableName: tableName, Item: signedData }).promise());
  if (!goWriteDb.success)
    return { statusCode: 500, headers, body: `unable to send signed data to dynamodb, ${goWriteDb.error.message}` };

  return { statusCode: 201, headers, body: JSON.stringify(signedData) };
};

export const getData = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (isNil(event.pathParameters?.beaconId))
    return { statusCode: 400, headers, body: "invalid request, missing path parameter" };

  const goReadDb = await go(() =>
    docClient.get({ TableName: tableName, Key: { beaconId: event.pathParameters?.beaconId } }).promise(),
  );
  if (!goReadDb.success)
    return { statusCode: 500, headers, body: `unable to get signed data from dynamodb, ${goReadDb.error.message}` };

  if (isNil(goReadDb.data.Item))
    return {
      statusCode: 404,
      headers,
      body: `signed data for given beaconId (${event.pathParameters?.beaconId}) not found`,
    };

  return { statusCode: 200, headers, body: JSON.stringify(goReadDb.data.Item) };
};

export const listData = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const goScanDb = await go(() => docClient.scan({ TableName: tableName }).promise());
  if (!goScanDb.success)
    return { statusCode: 500, headers, body: `unable to scan dynamodb, ${goScanDb.error.message}` };

  return { statusCode: 200, headers, body: JSON.stringify(goScanDb.data.Items) };
};
