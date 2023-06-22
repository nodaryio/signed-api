# Nodary Signature Pool

This repository contains code for a Nodary Signature Pool, which utilizes serverless infrastructure and is deployed on
AWS. It provides endpoints to handle signed data for a specific airnode.

## Technologies Used

- AWS DynamoDB: A NoSQL database service.
- AWS API Gateway: A fully managed service for creating, deploying, and managing APIs.
- AWS Lambda: A serverless computing service that runs your code in response to events.
- Node.js: A JavaScript runtime for server-side development.

## Getting Started

### Prerequisites

- `Node.js` and `yarn` should be installed on your machine.
- An AWS account with the necessary permissions to create and deploy the required resources.

### Installation

Clone the repository:

```bash
git clone git@github.com:nodaryio/signature-pool.git
```

Install the dependencies:

```bash
cd signature-pool
yarn
```

### Configuration

1. Copy `.env` from the `example.env` file.
2. Open the `.env` file and update the environment variables:
   - `HTTP_API_ID`: The ID of the HTTP API in AWS API Gateway.

### Deployment

To deploy infrastructure to AWS:

```bash
yarn deploy
```

To remove deployment:

```bash
yarn removeDeployment
```

## Public Endpoint

The Nodary Signature Pool is publicly accessible at the following endpoint:

- https://pool.nodary.io

## Usage

The API provides the following endpoints:

- `PUT /`: Upsert a single signed data.
- `POST /`: Upsert a batch of signed data.
- `GET /{airnode}`: Retrieve signed data for a specific airnode.
- `GET /`: Retrieve a list of all signed data.

### Examples

Here are some examples of how to use the API with `curl`:

```bash
# Upsert Data (HTTP PUT)
curl -X PUT -H "Content-Type: application/json" -d '{
    "feedName": "Example Feed 1",
    "oisTitle": "Example OIS 1",
    "beaconId": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "airnode": "0x0123456789abcdef0123456789abcdef0123456",
    "endpointId": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "templateId": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "parameters": "Example Parameters 1",
    "timestamp": "1620734400",
    "encodedValue": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "signature": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }' http://your-api-endpoint/

# Batch Upsert Data (HTTP POST)
curl -X POST -H "Content-Type: application/json" -d '[
  {
    "feedName": "Example Feed 1",
    "oisTitle": "Example OIS 1",
    ...
  },
  {
    "feedName": "Example Feed 2",
    "oisTitle": "Example OIS 2",
    ...
  }
]' http://your-api-endpoint/

# Get Data (HTTP GET)
curl http://your-api-endpoint/airnode-address

# List Data (HTTP GET)
curl http://your-api-endpoint/

```

## References

- To configure Cloudflare for caching, AWS API Gateway for custom domain support see
  [the page](https://kylebarron.dev/blog/caching-lambda-functions-cloudflare).
