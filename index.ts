import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import * as http2 from 'http2';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const apiUrl = 'https://api.joinformal.com';
const FORMAL_API_KEY_SECRET_ID = 'formal-api-key';
let FORMAL_API_KEY = '';
const client = new SecretsManagerClient();

interface FormalAPIResponse {
  username: string;
  password: string;
  expiresAt: string;
}

async function getAuthToken(apiKey: string, email: string): Promise<FormalAPIResponse> {
  return new Promise((resolve, reject) => {

    const client = http2.connect(apiUrl);
    
    client.on('error', (err) => {
      console.error('HTTP/2 connection error:', err);
      reject(err);
    });

    const req = client.request({
      ':method': 'POST',
      ':path': '/core.v1.UserService/CreateHumanUserPassword',
      'content-type': 'application/json',
      'x-api-key': apiKey,
    });

    let responseData = '';

    req.on('response', (headers) => {
      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          resolve({
            password: data.password,
            username: data.username,
            expiresAt: data.expiresAt,
          });
        } catch (error) {
          reject(error);
        }
        client.close();
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
      client.close();
    });

    req.end(JSON.stringify({ email }));
  });
}

function isValidEmail(email: string): boolean {
  const emailRegex = new RegExp(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
  return emailRegex.test(email);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!FORMAL_API_KEY) {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: FORMAL_API_KEY_SECRET_ID,
      }),
    );
    if (!response.SecretString) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          {
            message: 'Missing FORMAL_API_KEY',
          },
          null,
          2
        ),
      };
    }
    FORMAL_API_KEY = response.SecretString;
  }


  let userId = event?.requestContext?.authorizer?.iam?.userId
  if (!userId) {
    userId  = event?.requestContext?.identity?.caller
  }

  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify(
        {
          message: 'Missing userId',
        },
        null,
        2
      ),
    };
  }
  const split = userId.split(':')
  if (split.length !== 2) {
    return {
      statusCode: 400,
      body: JSON.stringify(
        {
          message: 'Invalid userId',
        },
        null,
        2
      ),
    };
  }
  const email = split[1]
  if (!isValidEmail(email)) {
    return {
      statusCode: 400,
      body: JSON.stringify(
        {
          message: 'Invalid email',
        },
        null,
        2
      ),
    };
  }

  const userToken = await getAuthToken(FORMAL_API_KEY, email)

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        token: userToken.password,
        username: userToken.username,
        expiresAt: userToken.expiresAt,
      },
      null,
      2
    ),
  };
};