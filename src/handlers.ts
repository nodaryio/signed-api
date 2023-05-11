import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import AWS from "aws-sdk";
import { PromiseError, SignedData, batchSignedDataSchema, evmAddressSchema, signedDataSchema } from "./types";
import { go, goSync } from "@api3/promise-utils";
import { isNil } from "lodash";
import { deriveBeaconId, recoverSignerAddress } from "./evm";

if (process.env.LOCAL_DEV) {
  require("aws-sdk/lib/maintenance_mode_message").suppress = true;
  const localAWSConfig = {
    accessKeyId: "not-important",
    secretAccessKey: "not-important",
    region: "local",
    endpoint: "http://localhost:8000",
  };
  AWS.config.update(localAWSConfig);
  console.log("AWS SDK was configured for local development.");
}

const docClient = new AWS.DynamoDB.DocumentClient();
const tableName = "signedDataPool";
const headers = {
  "content-type": "application/json",
};

const generateErrorResponse = (
  statusCode: number,
  message: string,
  detail?: string,
  causing?: SignedData,
): APIGatewayProxyResult => {
  return { statusCode, headers, body: JSON.stringify({ message, detail, causing }) };
};

export const upsertData = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (isNil(event.body)) return generateErrorResponse(400, "Invalid request, http body is missing");

  const goJsonParseBody = goSync(() => JSON.parse(event.body as string));
  if (!goJsonParseBody.success) return generateErrorResponse(400, "Invalid request, body must be in JSON");

  const goValidateSchema = await go(() => signedDataSchema.parseAsync(goJsonParseBody.data));
  if (!goValidateSchema.success)
    return generateErrorResponse(
      400,
      "Invalid request, body must fit schema for signed data",
      goValidateSchema.error.message,
    );

  const signedData = goValidateSchema.data;

  const goRecoverSigner = goSync(() => recoverSignerAddress(signedData));
  if (!goRecoverSigner.success)
    return generateErrorResponse(400, "Unable to recover signer address", goRecoverSigner.error.message);

  if (signedData.airnode !== goRecoverSigner.data) return generateErrorResponse(400, "Signature is invalid");

  const goDeriveBeaconId = goSync(() => deriveBeaconId(signedData.airnode, signedData.templateId));
  if (!goDeriveBeaconId.success)
    return generateErrorResponse(
      400,
      "Unable to derive beaconId by given airnode and templateId",
      goDeriveBeaconId.error.message,
    );

  if (signedData.beaconId !== goDeriveBeaconId.data) return generateErrorResponse(400, "beaconId is invalid");

  const goReadDb = await go(() =>
    docClient
      .get({ TableName: tableName, Key: { airnode: signedData.airnode, templateId: signedData.templateId } })
      .promise(),
  );
  if (!goReadDb.success)
    return generateErrorResponse(
      500,
      "Unable to get signed data from database to validate timestamp",
      goReadDb.error.message,
    );

  if (!isNil(goReadDb.data.Item) && parseInt(signedData.timestamp) <= parseInt(goReadDb.data.Item.timestamp))
    return generateErrorResponse(400, "Request isn't updating the timestamp");

  const goWriteDb = await go(() => docClient.put({ TableName: tableName, Item: signedData }).promise());
  if (!goWriteDb.success)
    return generateErrorResponse(500, "Unable to send signed data to database", goWriteDb.error.message);

  return { statusCode: 201, headers, body: JSON.stringify({ count: 1 }) };
};

export const batchUpsertData = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (isNil(event.body)) return generateErrorResponse(400, "Invalid request, http body is missing");

  const goJsonParseBody = goSync(() => JSON.parse(event.body as string));
  if (!goJsonParseBody.success) return generateErrorResponse(400, "Invalid request, body must be in JSON");

  const goValidateSchema = await go(() => batchSignedDataSchema.parseAsync(goJsonParseBody.data));
  if (!goValidateSchema.success)
    return generateErrorResponse(
      400,
      "Invalid request, body must fit schema for batch of signed data",
      goValidateSchema.error.message,
    );

  const batchSignedData = goValidateSchema.data;

  // Validations have same behaviour with Promise.all, if one of them is failed, all batch will be dropped

  // Phase 1: Check whether any duplications exist
  if (
    batchSignedData.length !==
    new Set(batchSignedData.map(({ airnode, templateId }) => airnode.concat(templateId))).size
  )
    return generateErrorResponse(400, "No duplications are allowed");

  // Phase 2: Check validations that can be done without using http request, returns fail response in first error
  const phase2Promises = batchSignedData.map(async (signedData) => {
    const goRecoverSigner = goSync(() => recoverSignerAddress(signedData));
    if (!goRecoverSigner.success)
      return Promise.reject(
        generateErrorResponse(400, "Unable to recover signer address", goRecoverSigner.error.message, signedData),
      );

    if (signedData.airnode !== goRecoverSigner.data)
      return Promise.reject(generateErrorResponse(400, "Signature is invalid", undefined, signedData));

    const goDeriveBeaconId = goSync(() => deriveBeaconId(signedData.airnode, signedData.templateId));
    if (!goDeriveBeaconId.success)
      return Promise.reject(
        generateErrorResponse(
          400,
          "Unable to derive beaconId by given airnode and templateId",
          goDeriveBeaconId.error.message,
          signedData,
        ),
      );

    if (signedData.beaconId !== goDeriveBeaconId.data)
      return Promise.reject(generateErrorResponse(400, "beaconId is invalid", undefined, signedData));
  });

  const goPhase2Results = await go<any, PromiseError<APIGatewayProxyResult>>(() => Promise.all(phase2Promises));
  if (!goPhase2Results.success) return goPhase2Results.error.reason;

  // Phase 3: Get current signed data to compare timestamp, returns fail response in first error
  const phase3Promises = batchSignedData.map(async (signedData) => {
    const goReadDb = await go(() =>
      docClient
        .get({ TableName: tableName, Key: { airnode: signedData.airnode, templateId: signedData.templateId } })
        .promise(),
    );
    if (!goReadDb.success)
      return Promise.reject(
        generateErrorResponse(
          500,
          "Unable to get signed data from database to validate timestamp",
          goReadDb.error.message,
          signedData,
        ),
      );

    if (!isNil(goReadDb.data.Item) && parseInt(signedData.timestamp) <= parseInt(goReadDb.data.Item.timestamp))
      return Promise.reject(generateErrorResponse(400, "Request isn't updating the timestamp", undefined, signedData));
  });

  const goPhase3Results = await go<any, PromiseError<APIGatewayProxyResult>>(() => Promise.all(phase3Promises));
  if (!goPhase3Results.success) return goPhase3Results.error.reason;

  // Phase 4: Write batch of validated data to the database
  const goBatchWriteDb = await go(() =>
    docClient
      .batchWrite({
        RequestItems: { [tableName]: batchSignedData.map((signedData) => ({ PutRequest: { Item: signedData } })) },
      })
      .promise(),
  );
  if (!goBatchWriteDb.success)
    return generateErrorResponse(500, "Unable to send batch of signed data to database", goBatchWriteDb.error.message);

  return { statusCode: 201, headers, body: JSON.stringify({ count: batchSignedData.length }) };
};

export const getData = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (isNil(event.pathParameters?.airnode))
    return generateErrorResponse(400, "Invalid request, path parameter airnode address is missing");

  const goValidateSchema = await go(() => evmAddressSchema.parseAsync(event.pathParameters?.airnode));
  if (!goValidateSchema.success)
    return generateErrorResponse(400, "Invalid request, path parameter must be an EVM address");

  const goReadDb = await go(() =>
    docClient
      .query({
        TableName: tableName,
        KeyConditionExpression: "airnode = :airnode",
        ExpressionAttributeValues: {
          ":airnode": event.pathParameters?.airnode,
        },
      })
      .promise(),
  );
  if (!goReadDb.success)
    return generateErrorResponse(500, "Unable to get signed data from database", goReadDb.error.message);

  return { statusCode: 200, headers, body: JSON.stringify({ count: goReadDb.data.Count, data: goReadDb.data.Items }) };
};

export const listData = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const goScanDb = await go(() => docClient.scan({ TableName: tableName }).promise());
  if (!goScanDb.success) return generateErrorResponse(500, "Unable to scan database", goScanDb.error.message);

  return { statusCode: 200, headers, body: JSON.stringify({ count: goScanDb.data.Count, data: goScanDb.data.Items }) };
};
